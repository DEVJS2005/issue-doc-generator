import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { gerarIssue, type ResultadoGeracao } from "../geracao/servico.js";
import { ErroGeracao, normalizarErro } from "../ia/erros.js";
import type { Provedor } from "../ia/tipos.js";
import { TIPOS_ISSUE } from "../issue/schema.js";
import { formatarEntrada } from "../prompt/entrada.js";

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
  config: Config;
  provedor: Provedor | null;
};

/**
 * Executa uma geração (ou refinamento) com SSE, cancelamento e tempo limite. Exportado para a
 * rota de refinar reaproveitar o mesmo fluxo com outra mensagem de usuário.
 */
export async function responderComGeracao(
  app: FastifyInstance,
  reply: FastifyReply,
  o: OpcoesRotaGerar & { usuario: string; tipoPedido: "gerar" | "refinar"; logExtra: Record<string, unknown> },
) {
  if (!o.provedor) {
    const e = new ErroGeracao("nao_configurado");
    return reply.code(503).send({ erro: e.paraTela() });
  }

  const sse = abrirSse(reply);
  const controle = new AbortController();
  let terminou = false;

  // A pessoa fechou a aba ou clicou em Cancelar: a conexão cai e a chamada à IA é interrompida.
  reply.raw.on("close", () => {
    if (!terminou) controle.abort(new ErroGeracao("cancelado"));
  });
  const limite = setTimeout(() => controle.abort(new ErroGeracao("tempo_esgotado")), o.config.tempoLimiteMs);

  sse.enviar("inicio", { provedor: o.provedor.nome, modelo: o.provedor.modelo });
  const inicio = Date.now();

  try {
    const r: ResultadoGeracao = await gerarIssue(o.provedor, o.usuario, {
      signal: controle.signal,
      aoProgresso: (p) => sse.enviar("progresso", p),
    });
    app.log.info(
      {
        evento: o.tipoPedido,
        provedor: r.provedor,
        modelo: r.modelo,
        usouFallback: r.usouFallback,
        tokens: r.uso,
        duracaoMs: r.duracaoMs,
        avisos: r.avisos.length,
        ...o.logExtra,
      },
      `${o.tipoPedido}: ok (cache lido: ${r.uso.cacheLeitura} tokens)`,
    );
    sse.enviar("resultado", {
      issue: r.issue,
      markdown: r.markdown,
      avisos: r.avisos,
      modelo: r.modelo,
      usouFallback: r.usouFallback,
      duracaoMs: r.duracaoMs,
    });
  } catch (erro) {
    const e = normalizarErro(erro, controle.signal);
    app.log.warn(
      { evento: `${o.tipoPedido}_falhou`, codigo: e.codigo, detalhe: e.detalhe, duracaoMs: Date.now() - inicio, ...o.logExtra },
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
  app.post("/api/gerar", async (request, reply) => {
    const corpo = CorpoGerar.safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({
        erro: { codigo: "entrada_invalida", mensagem: corpo.error.issues[0]?.message ?? "Entrada inválida.", podeTentarDeNovo: false },
      });
    }
    const entrada = corpo.data;
    // LGPD: o texto da descrição só vai para o log se REGISTRAR_DESCRICAO=true.
    const logExtra: Record<string, unknown> = {
      tipo: entrada.tipo,
      produto: entrada.produto,
      caracteresDescricao: entrada.descricao.length,
      caracteresContexto: entrada.contexto.length,
      ...(o.config.registrarDescricao ? { descricao: entrada.descricao, contexto: entrada.contexto } : {}),
    };
    await responderComGeracao(app, reply, { ...o, usuario: formatarEntrada(entrada), tipoPedido: "gerar", logExtra });
  });
}
