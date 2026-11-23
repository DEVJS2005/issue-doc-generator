import { verificarCoerencia } from "../issue/coerencia.js";
import { avaliarQualidade } from "../issue/qualidade.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { STATUS_ISSUE, type RepositorioHistorico, type StatusIssue } from "../banco/historico.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";
import { usuarioObrigatorio } from "../auth/acesso.js";

const NAO_ENCONTRADA = { erro: { codigo: "nao_encontrado", mensagem: "Issue não encontrada.", podeTentarDeNovo: false } };

const CorpoStatus = z.object({ status: z.enum(STATUS_ISSUE, { error: "Escolha um status válido." }) });

/** Período da busca: ms desde 1970, vindo da tela já no fuso de quem busca. */
function lerData(valor: string | undefined): number | undefined | null {
  if (valor === undefined || valor === "") return undefined;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function statusDoFiltro(valor: string | undefined): StatusIssue | undefined {
  return STATUS_ISSUE.includes(valor as StatusIssue) ? (valor as StatusIssue) : undefined;
}

/** Cada pessoa vê as próprias issues; o admin vê as de todos. */
export function podeVer(request: FastifyRequest, dono: string | null) {
  if (dono === null) return false;
  const u = usuarioObrigatorio(request);
  return u.admin || dono === u.email;
}

export function registrarHistorico(app: FastifyInstance, o: { historico: RepositorioHistorico; usuarios: RepositorioUsuarios }) {
  app.get("/api/historico", async (request, reply) => {
    const q = request.query as {
      todos?: string;
      usuario?: string;
      texto?: string;
      produto?: string;
      tipo?: string;
      status?: string;
      de?: string;
      ate?: string;
    };
    const de = lerData(q.de);
    const ate = lerData(q.ate);
    if (de === null || ate === null) {
      return reply.code(400).send({ erro: { codigo: "entrada_invalida", mensagem: "Período inválido.", podeTentarDeNovo: false } });
    }
    const u = usuarioObrigatorio(request);
    const todos = u.admin && q.todos === "1";
    // O filtro do admin aceita o nome de usuário ou o e-mail; o histórico guarda o e-mail.
    const nomes = o.usuarios.nomesPorEmail();
    const filtro = q.usuario?.trim();
    const emailDoFiltro = filtro && !filtro.includes("@") ? [...nomes].find(([, n]) => n === filtro.toLowerCase())?.[0] ?? filtro : filtro;
    const usuario = todos ? emailDoFiltro || undefined : u.email;
    const curto = (v?: string) => v?.slice(0, 200);
    const itens = o.historico
      .listar({ usuario, texto: curto(q.texto), produto: curto(q.produto), tipo: curto(q.tipo), status: statusDoFiltro(q.status), de, ate })
      .map((i) => ({ ...i, autor: nomes.get(i.usuario) ?? i.usuario }));
    return { itens, podeVerTodos: u.admin, produtos: o.historico.produtos(todos ? undefined : u.email) };
  });

  app.get("/api/historico/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    const item = o.historico.obter(id);
    const nomes = o.usuarios.nomesPorEmail();
    const autor = item ? (nomes.get(item.usuario) ?? item.usuario) : null;
    const mudancasStatus = o.historico.mudancasStatus(id).map((m) => ({ ...m, quem: nomes.get(m.quem) ?? m.quem }));
    // Ao abrir do histórico, os avisos e a nota são recalculados sobre a versão atual.
    const analise = item ? { avisos: verificarCoerencia(item.issue), qualidade: avaliarQualidade(item.issue) } : null;
    return { item: item && { ...item, autor, ...analise }, versoes: o.historico.versoes(id), mudancasStatus };
  });

  // Status: Rascunho → Revisada → Aprovada (e de volta). Quem pode ver a issue pode mudar.
  app.patch("/api/historico/:id/status", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    const corpo = CorpoStatus.safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({ erro: { codigo: "entrada_invalida", mensagem: "Escolha um status válido.", podeTentarDeNovo: false } });
    }
    const mudanca = o.historico.mudarStatus(id, corpo.data.status, usuarioObrigatorio(request).email);
    if (mudanca) request.log.info({ evento: "issue_status", id, de: mudanca.de, para: mudanca.para, usuario: usuarioObrigatorio(request).email }, "histórico: status");
    const nomes = o.usuarios.nomesPorEmail();
    return {
      status: corpo.data.status,
      mudancasStatus: o.historico.mudancasStatus(id).map((m) => ({ ...m, quem: nomes.get(m.quem) ?? m.quem })),
    };
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
    request.log.info({ evento: "issue_apagada", usuario: usuarioObrigatorio(request).email, id }, "histórico: issue apagada");
    return { ok: true };
  });
}
