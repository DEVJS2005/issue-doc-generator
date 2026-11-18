import { ImagensSchema, LIMITE_CORPO_COM_IMAGENS, type ImagemAnexa } from "../ia/imagens.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Ajustes } from "../ajustes/ajustes.js";
import type { RepositorioHistorico } from "../banco/historico.js";
import type { Config } from "../config.js";
import { custoEstimado } from "../custo.js";
import { gerarIssue, type ResultadoGeracao } from "../geracao/servico.js";
import { ErroGeracao, normalizarErro } from "../ia/erros.js";
import { partesAlteradas } from "../issue/alteracoes.js";
import { TIPOS_ISSUE, type Issue } from "../issue/schema.js";
import { formatarEntrada, IDIOMAS, type Entrada } from "../prompt/entrada.js";

export const LIMITE_DESCRICAO = 4000;
export const LIMITE_CONTEXTO = 8000;

export const CorpoGerar = z.object({
  descricao: z
    .string()
    .trim()
    .min(1, "A descrição é obrigatória.")
    .max(LIMITE_DESCRICAO, `A descrição pode ter até ${LIMITE_DESCRICAO} caracteres.`),
  tipo: z.enum(TIPOS_ISSUE, { error: "Escolha um tipo válido." }),
  produto: z.string().trim().min(1, "Informe o produto.").max(120, "O nome do produto pode ter até 120 caracteres."),
  contexto: z
    .string()
    .trim()
    .max(LIMITE_CONTEXTO, `O contexto pode ter até ${LIMITE_CONTEXTO} caracteres.`)
    .default(""),
  idioma: z.enum(IDIOMAS, { error: "Escolha o idioma: português, inglês ou espanhol." }).default("pt-BR"),
});

const INTERVALO_PING_MS = 15_000;

/** Abre um stream SSE na resposta. Eventos: inicio, progresso, resultado, erro. */
function abrirSse(reply: FastifyReply) {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  raw.flushHeaders?.();
  const ping = setInterval(() => raw.write(": ping\n\n"), INTERVALO_PING_MS);
  return {
    enviar(evento: string, dados: unknown) {
      if (!raw.writableEnded) raw.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
    },
    fechar() {
      clearInterval(ping);
      if (!raw.writableEnded) raw.end();
    },
  };
}

export type OpcoesRotaGerar = {
  /** Config do .env (log, preço). Provedor, modelo e limites em uso vêm de `ajustes`. */
  config: Config;
  ajustes: Ajustes;
  historico: RepositorioHistorico;
};

function horaLocal(ms: number) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/**
 * Executa uma geração (ou refinamento) com SSE, cancelamento e tempo limite, e guarda o
 * resultado no histórico. Exportado para a rota de refinar reaproveitar o mesmo fluxo.
 */
export async function responderComGeracao(
  app: FastifyInstance,
  reply: FastifyReply,
  o: OpcoesRotaGerar & {
    usuario: string;
    tipoPedido: "gerar" | "refinar";
    logExtra: Record<string, unknown>;
    entrada: Entrada;
    /** No refinamento: a issue antes do ajuste (para listar o que mudou), o ajuste e a issue do histórico. */
    refinamento?: { issueAnterior: Issue; ajuste: string; historicoId: number | null };
    /** Prints anexados (só na geração; vão para a IA e não para o histórico). */
    imagens?: ImagemAnexa[];
  },
) {
  const provedor = o.ajustes.provedor();
  const emUso = o.ajustes.config();
  if (!provedor) {
    const e = new ErroGeracao("nao_configurado");
    return reply.code(503).send({ erro: e.paraTela() });
  }

  const quem = reply.request.usuario?.email ?? "anonimo";
  const cota = o.ajustes.limiteUso.tentar(quem);
  if (!cota.ok) {
    app.log.warn({ evento: "limite_uso", usuario: quem }, "limite de uso atingido");
    return reply.code(429).send({
      erro: {
        codigo: "limite_uso",
        mensagem: `Você atingiu o limite de ${emUso.limitePorHora} gerações por hora. Tente de novo a partir das ${horaLocal(cota.liberaEm)}.`,
        podeTentarDeNovo: false,
      },
    });
  }

  const sse = abrirSse(reply);
  const controle = new AbortController();
  let terminou = false;

  // A pessoa fechou a aba ou clicou em Cancelar: a conexão cai e a chamada à IA é interrompida.
  reply.raw.on("close", () => {
    if (!terminou) controle.abort(new ErroGeracao("cancelado"));
  });
  const limite = setTimeout(() => controle.abort(new ErroGeracao("tempo_esgotado")), emUso.tempoLimiteMs);

  sse.enviar("inicio", { provedor: provedor.nome, modelo: provedor.modelo });
  const inicio = Date.now();

  try {
    const r: ResultadoGeracao = await gerarIssue(provedor, o.usuario, {
      idioma: o.entrada.idioma,
      imagens: o.imagens,
      signal: controle.signal,
      aoProgresso: (p) => sse.enviar("progresso", p),
    });
    const custo = custoEstimado(r.modelo, r.uso, o.config.precoPorMtok);
    app.log.info(
      {
        evento: o.tipoPedido,
        usuario: quem,
        custoEstimadoUsd: custo,
        provedor: r.provedor,
        modelo: r.modelo,
        usouFallback: r.usouFallback,
        tokens: r.uso,
        duracaoMs: r.duracaoMs,
        avisos: r.avisos.length,
        ...o.logExtra,
      },
      `${o.tipoPedido}: ok (cache lido: ${r.uso.cacheLeitura} tokens${custo === null ? "" : `, ~US$ ${custo}`})`,
    );

    // Falha ao guardar no histórico não pode derrubar a geração: a issue já está pronta.
    let historicoId: number | null = null;
    try {
      const ref = o.refinamento;
      if (ref?.historicoId) {
        o.historico.salvarRefinamento(ref.historicoId, ref.ajuste, r.issue, r.markdown, r.modelo, quem);
        historicoId = ref.historicoId;
      } else {
        historicoId = o.historico.salvarNova(quem, o.entrada, r.issue, r.markdown, r.modelo);
      }
    } catch (erroHistorico) {
      app.log.error({ evento: "historico_falhou", usuario: quem, detalhe: String(erroHistorico) }, "histórico: não foi possível salvar");
    }

    sse.enviar("resultado", {
      issue: r.issue,
      markdown: r.markdown,
      avisos: r.avisos,
      alteracoes: o.refinamento ? partesAlteradas(o.refinamento.issueAnterior, r.issue) : null,
      modelo: r.modelo,
      usouFallback: r.usouFallback,
      duracaoMs: r.duracaoMs,
      historicoId,
    });
  } catch (erro) {
    const e = normalizarErro(erro, controle.signal);
    app.log.warn(
      {
        evento: `${o.tipoPedido}_falhou`,
        usuario: quem,
        codigo: e.codigo,
        detalhe: e.detalhe,
        duracaoMs: Date.now() - inicio,
        ...o.logExtra,
      },
      `${o.tipoPedido}: ${e.codigo}`,
    );
    sse.enviar("erro", e.paraTela());
  } finally {
    terminou = true;
    clearTimeout(limite);
    sse.fechar();
  }
}

export function registrarRotaGerar(app: FastifyInstance, o: OpcoesRotaGerar) {
  // Com prints anexados o corpo passa de 1 MB (o padrão do Fastify): limite maior só nesta rota.
  app.post("/api/gerar", { bodyLimit: LIMITE_CORPO_COM_IMAGENS }, async (request, reply) => {
    const corpo = CorpoGerar.safeParse(request.body);
    const anexos = ImagensSchema.safeParse((request.body as { imagens?: unknown } | null)?.imagens);
    if (corpo.success && !anexos.success) {
      return reply.code(400).send({
        erro: { codigo: "entrada_invalida", mensagem: anexos.error.issues[0]?.message ?? "Imagem inválida.", podeTentarDeNovo: false },
      });
    }
    if (!corpo.success) {
      return reply.code(400).send({
        erro: { codigo: "entrada_invalida", mensagem: corpo.error.issues[0]?.message ?? "Entrada inválida.", podeTentarDeNovo: false },
      });
    }
    const entrada = corpo.data;
    const imagens = anexos.success ? anexos.data : [];
    // LGPD: o texto da descrição só vai para o log se REGISTRAR_DESCRICAO=true. (No histórico ele
    // fica, porque é a própria issue; a retenção da administração apaga as antigas.)
    const logExtra: Record<string, unknown> = {
      tipo: entrada.tipo,
      produto: entrada.produto,
      caracteresDescricao: entrada.descricao.length,
      caracteresContexto: entrada.contexto.length,
      imagens: imagens.length,
      ...(o.config.registrarDescricao ? { descricao: entrada.descricao, contexto: entrada.contexto } : {}),
    };
    await responderComGeracao(app, reply, { ...o, usuario: formatarEntrada(entrada, imagens.length), tipoPedido: "gerar", logExtra, entrada, imagens });
  });
}
