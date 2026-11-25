import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Ajustes } from "../ajustes/ajustes.js";
import { usuarioObrigatorio } from "../auth/acesso.js";
import type { RepositorioContextoUsuario } from "../banco/contextoUsuario.js";
import type { Config } from "../config.js";
import { custoEstimado } from "../custo.js";
import { ErroGeracao, normalizarErro } from "../ia/erros.js";
import { formatarContextoSistema, limpar } from "../prompt/entrada.js";
import { promptCompactarContexto } from "../prompt/montar.js";

/** Texto que a pessoa escreve (não vai para a IA nas gerações; só no resumo). */
export const LIMITE_CONTEXTO_ORIGINAL = 8000;
/** Versão compacta, a que vai em toda geração: curta para gastar poucos tokens. */
export const LIMITE_CONTEXTO_COMPACTO = 2000;
/** Saída do resumo: sobra para os 1.500 caracteres pedidos no prompt. */
const MAX_TOKENS_RESUMO = 1200;

const erro = (codigo: string, mensagem: string, podeTentarDeNovo = false) => ({ erro: { codigo, mensagem, podeTentarDeNovo } });

const Original = z.string().trim().max(LIMITE_CONTEXTO_ORIGINAL, `O contexto pode ter até ${LIMITE_CONTEXTO_ORIGINAL} caracteres.`);
const CorpoCompactar = z.object({ texto: Original.min(1, "Escreva o contexto do seu sistema.") });
const CorpoSalvar = z.object({
  original: Original,
  compacto: z.string().trim().max(LIMITE_CONTEXTO_COMPACTO, `A versão compacta pode ter até ${LIMITE_CONTEXTO_COMPACTO} caracteres.`),
});

/**
 * "Meu contexto": cada pessoa descreve o sistema dela; a IA resume uma vez (ao pedir) e a pessoa
 * revisa a versão compacta antes de salvar. Só a compacta vai nas gerações.
 */
export function registrarContexto(app: FastifyInstance, o: { config: Config; ajustes: Ajustes; contextos: RepositorioContextoUsuario }) {
  const limite = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

  app.get("/api/contexto", limite, async (request) => {
    const u = usuarioObrigatorio(request);
    return { ...o.contextos.ler(u.email), limites: { original: LIMITE_CONTEXTO_ORIGINAL, compacto: LIMITE_CONTEXTO_COMPACTO } };
  });

  // Uma chamada à IA: conta no limite de gerações por hora, como gerar e refinar.
  app.post("/api/contexto/compactar", limite, async (request, reply) => {
    const u = usuarioObrigatorio(request);
    const corpo = CorpoCompactar.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", corpo.error.issues[0]?.message ?? "Entrada inválida."));
    const provedor = o.ajustes.provedor();
    if (!provedor) return reply.code(503).send({ erro: new ErroGeracao("nao_configurado").paraTela() });
    const cota = o.ajustes.limiteUso.tentar(u.email);
    if (!cota.ok) return reply.code(429).send(erro("limite_uso", `Você atingiu o limite de ${o.ajustes.config().limitePorHora} pedidos por hora. Tente de novo mais tarde.`));

    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(new ErroGeracao("tempo_esgotado")), o.ajustes.config().tempoLimiteMs);
    try {
      const r = await provedor.gerar(
        { sistema: promptCompactarContexto(), usuario: formatarContextoSistema(corpo.data.texto), formato: "texto" },
        { signal: controle.signal, aoProgresso: () => undefined },
      );
      const compacto = limpar(r.texto).slice(0, LIMITE_CONTEXTO_COMPACTO);
      if (!compacto) throw new ErroGeracao("json_invalido", "resumo vazio");
      const custo = custoEstimado(r.modelo, r.uso, o.config.precoPorMtok);
      // Sem o texto no log (LGPD): só tamanhos, tokens e custo.
      request.log.info(
        { evento: "contexto_compactado", usuario: u.email, modelo: r.modelo, tokens: r.uso, custoEstimadoUsd: custo, caracteres: { original: corpo.data.texto.length, compacto: compacto.length } },
        "contexto: versão compacta gerada",
      );
      return { compacto };
    } catch (e) {
      const falha = normalizarErro(e, controle.signal);
      request.log.warn({ evento: "contexto_falhou", usuario: u.email, codigo: falha.codigo }, "contexto: resumo falhou");
      return reply.code(502).send({ erro: falha.paraTela() });
    } finally {
      clearTimeout(prazo);
    }
  });

  app.put("/api/contexto", { ...limite, bodyLimit: 64 * 1024 }, async (request, reply) => {
    const u = usuarioObrigatorio(request);
    const corpo = CorpoSalvar.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", corpo.error.issues[0]?.message ?? "Entrada inválida."));
    if (corpo.data.original && !corpo.data.compacto) return reply.code(400).send(erro("entrada_invalida", "Gere ou escreva a versão compacta antes de salvar."));
    o.contextos.salvar(u.email, corpo.data.original, limpar(corpo.data.compacto));
    return o.contextos.ler(u.email);
  });

  app.delete("/api/contexto", limite, async (request) => {
    const u = usuarioObrigatorio(request);
    o.contextos.apagar(u.email);
    return { ok: true };
  });

  // "Agora não" no aviso do primeiro acesso.
  app.post("/api/contexto/aviso", limite, async (request) => {
    const u = usuarioObrigatorio(request);
    o.contextos.dispensarAviso(u.email);
    return { ok: true };
  });
}
