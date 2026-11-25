import type { FastifyInstance } from "fastify";
import { usuarioObrigatorio } from "../auth/acesso.js";
import { cookieSaida } from "../auth/sessao.js";
import type { RepositorioSessoes } from "../banco/sessoes.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";
import { seguro } from "./auth.js";

const NAO_ENCONTRADA = { erro: { codigo: "nao_encontrado", mensagem: "Sessão não encontrada. Ela pode já ter sido encerrada.", podeTentarDeNovo: false } };

/**
 * Sessões abertas de quem está logado: lista, encerrar uma e "Sair de todos os dispositivos".
 * Cada pessoa vê e encerra só as próprias. Encerrar a sessão deste pedido também apaga o cookie.
 */
export function registrarSessoes(app: FastifyInstance, o: { sessoes: RepositorioSessoes; usuarios: RepositorioUsuarios }) {
  app.get("/api/sessoes", async (request) => {
    const u = usuarioObrigatorio(request);
    const sessoes = o.sessoes.listar(u.email, o.usuarios.sessoesValidasDesde(u.email));
    return { sessoes: sessoes.map((s) => ({ ...s, atual: s.id === request.sessaoId })) };
  });

  app.delete("/api/sessoes/:id", async (request, reply) => {
    const u = usuarioObrigatorio(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !o.sessoes.encerrar(id, u.email)) return reply.code(404).send(NAO_ENCONTRADA);
    const atual = id === request.sessaoId;
    request.log.info({ evento: "sessao_encerrada", usuario: u.email, sessao: id, atual }, "sessões: sessão encerrada");
    if (atual) reply.header("set-cookie", cookieSaida(seguro(request)));
    return { ok: true, atual };
  });

  app.post("/api/sessoes/encerrar-todas", async (request, reply) => {
    const u = usuarioObrigatorio(request);
    const encerradas = o.sessoes.encerrarTodas(u.email);
    request.log.info({ evento: "sessoes_encerradas", usuario: u.email, encerradas }, "sessões: saiu de todos os dispositivos");
    reply.header("set-cookie", cookieSaida(seguro(request)));
    return { encerradas };
  });
}
