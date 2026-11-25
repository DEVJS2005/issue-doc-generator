import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AcaoAuditoria, RepositorioAuditoria } from "./banco/auditoria.js";

type Registro = {
  acao: AcaoAuditoria;
  /** Também registra estas respostas de erro (por padrão, só as de sucesso). */
  statusErro?: number[];
  alvo?: (r: FastifyRequest) => string | null;
  /** Metadados seguros. Nunca senha, token, chave nem texto de issue. */
  detalhe?: (r: FastifyRequest, status: number) => Record<string, unknown> | null;
};

type Corpo = Record<string, unknown>;
const corpo = (r: FastifyRequest): Corpo => (r.body && typeof r.body === "object" ? (r.body as Corpo) : {});
const param = (nome: string) => (r: FastifyRequest) => (r.params as Record<string, string>)[nome] ?? null;
const texto = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Campos que mudaram. A senha aparece só como "trocada", nunca o valor. */
const camposAlterados = (r: FastifyRequest) => {
  const c = corpo(r);
  const campos = Object.keys(c).filter((k) => c[k] !== undefined);
  const visiveis: Corpo = {};
  for (const k of campos) if (k !== "senha") visiveis[k] = c[k];
  return { campos, ...visiveis };
};

// Chave: "MÉTODO padrão-da-rota", como o Fastify registra.
const ROTAS: Record<string, Registro> = {
  "POST /api/login": {
    acao: "login",
    statusErro: [401],
    detalhe: (r, status) => (status === 401 ? { tentativa: texto(corpo(r).usuario ?? corpo(r).email, 200) ?? "" } : null),
  },
  "POST /api/configurar": { acao: "primeiro_admin" },
  "POST /api/gerar": {
    acao: "gerar",
    detalhe: (r) => ({ tipo: texto(corpo(r).tipo), produto: texto(corpo(r).produto), idioma: texto(corpo(r).idioma) ?? "pt-BR" }),
  },
  "POST /api/refinar": {
    acao: "refinar",
    alvo: (r) => {
      const id = corpo(r).historicoId;
      return typeof id === "number" ? String(id) : null;
    },
  },
  "PATCH /api/historico/:id/status": { acao: "status", alvo: param("id"), detalhe: (r) => ({ para: texto(corpo(r).status) }) },
  "DELETE /api/historico/:id": { acao: "apagar_issue", alvo: param("id") },
  "POST /api/historico/:id/links": { acao: "criar_link", alvo: param("id"), detalhe: (r) => ({ dias: corpo(r).dias }) },
  "DELETE /api/historico/:id/links/:link": { acao: "revogar_link", alvo: param("id"), detalhe: (r) => ({ link: param("link")(r) }) },
  // O que mudou nos ajustes (de → para) já fica em "Alterações recentes nos ajustes".
  "PUT /api/admin/ajustes": { acao: "ajustes" },
  "POST /api/admin/usuarios": {
    acao: "criar_usuario",
    detalhe: (r) => ({ nome: texto(corpo(r).nome), email: texto(corpo(r).email, 200), admin: corpo(r).admin === true }),
  },
  "PATCH /api/admin/usuarios/:id": { acao: "alterar_usuario", alvo: param("id"), detalhe: camposAlterados },
  "POST /api/admin/backups": { acao: "backup" },
  "GET /api/admin/backups/:nome": { acao: "baixar_backup", alvo: param("nome") },
  "POST /api/sair": { acao: "sair" },
  "DELETE /api/sessoes/:id": { acao: "encerrar_sessao", alvo: param("id") },
  "POST /api/sessoes/encerrar-todas": { acao: "encerrar_todas" },
  "POST /api/historico/:id/jira": { acao: "criar_jira", alvo: param("id"), detalhe: (r) => ({ projeto: texto(corpo(r).projeto, 50) }) },
};

/**
 * Registra na auditoria as ações que mudam algo (e os logins), depois da resposta. Um erro aqui
 * vira aviso no log e nunca derruba o pedido.
 */
export function registrarAuditoria(app: FastifyInstance, auditoria: RepositorioAuditoria) {
  app.addHook("onResponse", async (request, reply) => {
    const regra = ROTAS[`${request.method} ${request.routeOptions.url ?? ""}`];
    if (!regra) return;
    const status = reply.statusCode;
    if (status >= 400 && !regra.statusErro?.includes(status)) return;
    try {
      const falhouLogin = regra.acao === "login" && status === 401;
      auditoria.registrar({
        quem: request.usuario?.email ?? (falhouLogin ? "(desconhecido)" : "(anônimo)"),
        acao: falhouLogin ? "login_falhou" : regra.acao,
        alvo: regra.alvo?.(request) ?? null,
        detalhe: regra.detalhe?.(request, status) ?? null,
        ip: request.ip ?? null,
      });
    } catch (erro) {
      request.log.warn({ evento: "auditoria_falhou", detalhe: String(erro) }, "auditoria: não foi possível registrar");
    }
  });
}
