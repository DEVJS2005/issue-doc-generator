import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RepositorioHistorico } from "../banco/historico.js";

const NAO_ENCONTRADA = { erro: { codigo: "nao_encontrado", mensagem: "Issue não encontrada.", podeTentarDeNovo: false } };

/** Cada pessoa vê as próprias issues; o admin vê as de todos. */
export function podeVer(request: FastifyRequest, dono: string | null) {
  return dono !== null && (request.usuario!.admin || dono === request.usuario!.email);
}

export function registrarHistorico(app: FastifyInstance, o: { historico: RepositorioHistorico }) {
  app.get("/api/historico", async (request) => {
    const q = request.query as { todos?: string; usuario?: string };
    const u = request.usuario!;
    const todos = u.admin && q.todos === "1";
    const itens = o.historico.listar({ usuario: todos ? q.usuario || undefined : u.email });
    return { itens, podeVerTodos: u.admin };
  });

  app.get("/api/historico/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    return { item: o.historico.obter(id), versoes: o.historico.versoes(id) };
  });

  app.delete("/api/historico/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    o.historico.apagar(id);
    request.log.info({ evento: "issue_apagada", usuario: request.usuario!.email, id }, "histórico: issue apagada");
    return { ok: true };
  });
}
