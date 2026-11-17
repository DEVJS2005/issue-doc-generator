import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RepositorioHistorico } from "../banco/historico.js";
import { DIAS_LINK, type RepositorioLinks } from "../banco/links.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";
import { podeVer } from "./historico.js";

const NAO_ENCONTRADA = { erro: { codigo: "nao_encontrado", mensagem: "Issue não encontrada.", podeTentarDeNovo: false } };
const LINK_INVALIDO = { erro: { codigo: "link_invalido", mensagem: "Este link não existe, venceu ou foi revogado.", podeTentarDeNovo: false } };

const CorpoLink = z.object({
  dias: z.number().refine((d) => (DIAS_LINK as readonly number[]).includes(d)),
});

/**
 * Links de compartilhamento: quem pode ver a issue cria, lista e revoga (rotas com login); quem
 * tem o link lê a issue em /api/publico/<token>, sem login. O token só aparece na criação.
 */
export function registrarLinks(
  app: FastifyInstance,
  o: { historico: RepositorioHistorico; links: RepositorioLinks; usuarios: RepositorioUsuarios },
) {
  const nome = (email: string) => o.usuarios.nomesPorEmail().get(email) ?? email;
  const idDe = (params: unknown) => Number((params as { id: string }).id);

  app.post("/api/historico/:id/links", async (request, reply) => {
    const id = idDe(request.params);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    const corpo = CorpoLink.safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({ erro: { codigo: "entrada_invalida", mensagem: "Escolha a validade: 1, 7 ou 30 dias.", podeTentarDeNovo: false } });
    }
    const { token, link } = o.links.criar(id, request.usuario!.email, corpo.data.dias);
    request.log.info({ evento: "link_criado", id, link: link.id, dias: corpo.data.dias, usuario: request.usuario!.email }, "histórico: link criado");
    return reply.code(201).send({ url: `/compartilhado/${token}`, link: { ...link, criadoPor: nome(link.criadoPor) } });
  });

  app.get("/api/historico/:id/links", async (request, reply) => {
    const id = idDe(request.params);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    return { links: o.links.listar(id).map((l) => ({ ...l, criadoPor: nome(l.criadoPor) })) };
  });

  app.delete("/api/historico/:id/links/:link", async (request, reply) => {
    const id = idDe(request.params);
    const linkId = Number((request.params as { link: string }).link);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return reply.code(404).send(NAO_ENCONTRADA);
    if (!Number.isInteger(linkId) || !o.links.revogar(id, linkId)) {
      return reply.code(404).send({ erro: { codigo: "nao_encontrado", mensagem: "Link não encontrado.", podeTentarDeNovo: false } });
    }
    request.log.info({ evento: "link_revogado", id, link: linkId, usuario: request.usuario!.email }, "histórico: link revogado");
    return { ok: true };
  });

  // Leitura pública: só o necessário para mostrar a issue (sem e-mails, sem a entrada original).
  app.get("/api/publico/:token", async (request, reply) => {
    reply.header("cache-control", "no-store").header("x-robots-tag", "noindex").header("referrer-policy", "no-referrer");
    const token = (request.params as { token: string }).token;
    const id = token.length <= 100 ? o.links.abrir(token) : null;
    const item = id === null ? null : o.historico.obter(id);
    if (!item) return reply.code(404).send(LINK_INVALIDO);
    request.log.info({ evento: "link_aberto", id }, "histórico: issue aberta por link");
    return {
      issue: {
        titulo: item.titulo,
        produto: item.produto,
        tipo: item.tipo,
        status: item.status,
        versoes: item.versoes,
        atualizadaEm: item.atualizadaEm,
        autor: nome(item.usuario),
        markdown: item.markdown,
      },
    };
  });
}
