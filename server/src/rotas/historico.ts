import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RepositorioHistorico } from "../banco/historico.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";

const NAO_ENCONTRADA = { erro: { codigo: "nao_encontrado", mensagem: "Issue não encontrada.", podeTentarDeNovo: false } };

/** Cada pessoa vê as próprias issues; o admin vê as de todos. */
export function podeVer(request: FastifyRequest, dono: string | null) {
  return dono !== null && (request.usuario!.admin || dono === request.usuario!.email);
}

export function registrarHistorico(app: FastifyInstance, o: { historico: RepositorioHistorico; usuarios: RepositorioUsuarios }) {
  app.get("/api/historico", async (request) => {
    const q = request.query as { todos?: string; usuario?: string };
    const u = request.usuario!;
    const todos = u.admin && q.todos === "1";
    // O filtro do admin aceita o nome de usuário ou o e-mail; o histórico guarda o e-mail.
    const nomes = o.usuarios.nomesPorEmail();
    const filtro = q.usuario?.trim();
    const emailDoFiltro = filtro && !filtro.includes("@") ? [...nomes].find(([, n]) => n === filtro.toLowerCase())?.[0] ?? filtro : filtro;
    const itens = o.historico
      .listar({ usuario: todos ? emailDoFiltro || undefined : u.email })
      .map((i) => ({ ...i, autor: nomes.get(i.usuario) ?? i.usuario }));
    return { itens, podeVerTodos: u.admin };
  });

  app.get("/api/historico/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    return { item: o.historico.obter(id), versoes: o.historico.versoes(id) };
  });

  app.get("/api/historico/:id/versoes/:numero", async (request, reply) => {
    const p = request.params as { id: string; numero: string };
    const id = Number(p.id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    const versao = o.historico.versao(id, Number(p.numero));
    return versao ? { versao } : reply.code(404).send(NAO_ENCONTRADA);
  });

  app.delete("/api/historico/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    o.historico.apagar(id);
    request.log.info({ evento: "issue_apagada", usuario: request.usuario!.email, id }, "histórico: issue apagada");
    return { ok: true };
  });
}
