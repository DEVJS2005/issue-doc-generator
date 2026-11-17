import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RepositorioHistorico } from "../banco/historico.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";

const NAO_ENCONTRADA = { erro: { codigo: "nao_encontrado", mensagem: "Issue não encontrada.", podeTentarDeNovo: false } };

/** Período da busca: ms desde 1970, vindo da tela já no fuso de quem busca. */
function lerData(valor: string | undefined): number | undefined | null {
  if (valor === undefined || valor === "") return undefined;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Cada pessoa vê as próprias issues; o admin vê as de todos. */
export function podeVer(request: FastifyRequest, dono: string | null) {
  return dono !== null && (request.usuario!.admin || dono === request.usuario!.email);
}

export function registrarHistorico(app: FastifyInstance, o: { historico: RepositorioHistorico; usuarios: RepositorioUsuarios }) {
  app.get("/api/historico", async (request, reply) => {
    const q = request.query as { todos?: string; usuario?: string; texto?: string; produto?: string; tipo?: string; de?: string; ate?: string };
    const de = lerData(q.de);
    const ate = lerData(q.ate);
    if (de === null || ate === null) {
      return reply.code(400).send({ erro: { codigo: "entrada_invalida", mensagem: "Período inválido.", podeTentarDeNovo: false } });
    }
    const u = request.usuario!;
    const todos = u.admin && q.todos === "1";
    // O filtro do admin aceita o nome de usuário ou o e-mail; o histórico guarda o e-mail.
    const nomes = o.usuarios.nomesPorEmail();
    const filtro = q.usuario?.trim();
    const emailDoFiltro = filtro && !filtro.includes("@") ? [...nomes].find(([, n]) => n === filtro.toLowerCase())?.[0] ?? filtro : filtro;
    const usuario = todos ? emailDoFiltro || undefined : u.email;
    const curto = (v?: string) => v?.slice(0, 200);
    const itens = o.historico
      .listar({ usuario, texto: curto(q.texto), produto: curto(q.produto), tipo: curto(q.tipo), de, ate })
      .map((i) => ({ ...i, autor: nomes.get(i.usuario) ?? i.usuario }));
    return { itens, podeVerTodos: u.admin, produtos: o.historico.produtos(todos ? undefined : u.email) };
  });

  app.get("/api/historico/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    const item = o.historico.obter(id);
    const autor = item ? (o.usuarios.nomesPorEmail().get(item.usuario) ?? item.usuario) : null;
    return { item: item && { ...item, autor }, versoes: o.historico.versoes(id) };
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
