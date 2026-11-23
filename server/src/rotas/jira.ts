import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { RepositorioHistorico } from "../banco/historico.js";
import type { RepositorioJira } from "../banco/jira.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";
import { ErroJira, type ClienteJira } from "../integracoes/jira.js";
import { markdownParaJira } from "../integracoes/jira-texto.js";
import { podeVer } from "./historico.js";
import { usuarioObrigatorio } from "../auth/acesso.js";

const CorpoEnvio = z.object({
  projeto: z.string().trim().min(1, "Escolha o projeto do Jira.").max(50),
  tipoId: z.string().trim().min(1, "Escolha o tipo de issue do Jira.").max(30),
});

const ROTULO = "issue-doc-generator";

function erro(reply: FastifyReply, status: number, codigo: string, mensagem: string) {
  return reply.code(status).send({ erro: { codigo, mensagem, podeTentarDeNovo: status >= 500 || status === 429 } });
}

function falhou(reply: FastifyReply, e: unknown) {
  if (e instanceof ErroJira) return erro(reply, e.status, "jira", e.message);
  throw e;
}

/**
 * Criar a issue no Jira (item 26 do roadmap). Ligado só com JIRA_URL e JIRA_TOKEN no .env; as
 * credenciais ficam no servidor e nunca vão para a tela.
 */
export function registrarJira(
  app: FastifyInstance,
  o: { cliente: ClienteJira | null; historico: RepositorioHistorico; jira: RepositorioJira; usuarios: RepositorioUsuarios },
) {
  // Cada chamada vai a um servidor externo: limite por pessoa.
  const limite = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
  const desligado = (reply: FastifyReply) => erro(reply, 404, "jira_desligado", "A integração com o Jira não está configurada no servidor.");

  app.get("/api/jira", async () => ({ ligado: o.cliente !== null, url: o.cliente?.url ?? null }));

  app.get("/api/jira/projetos", limite, async (_request, reply) => {
    if (!o.cliente) return desligado(reply);
    try {
      return { projetos: await o.cliente.projetos() };
    } catch (e) {
      return falhou(reply, e);
    }
  });

  app.get("/api/jira/tipos", limite, async (request, reply) => {
    if (!o.cliente) return desligado(reply);
    const projeto = String((request.query as { projeto?: string }).projeto ?? "").trim();
    if (!projeto || projeto.length > 50) return erro(reply, 400, "entrada_invalida", "Escolha o projeto do Jira.");
    try {
      return { tipos: await o.cliente.tipos(projeto) };
    } catch (e) {
      return falhou(reply, e);
    }
  });

  app.get("/api/historico/:id/jira", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return erro(reply, 404, "nao_encontrado", "Issue não encontrada.");
    const envio = o.jira.obter(id);
    const nomes = o.usuarios.nomesPorEmail();
    return { envio: envio && { ...envio, enviadoPor: nomes.get(envio.enviadoPor) ?? envio.enviadoPor } };
  });

  app.post("/api/historico/:id/jira", limite, async (request, reply) => {
    if (!o.cliente) return desligado(reply);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || !podeVer(request, o.historico.dono(id))) return erro(reply, 404, "nao_encontrado", "Issue não encontrada.");
    const corpo = CorpoEnvio.safeParse(request.body);
    if (!corpo.success) return erro(reply, 400, "entrada_invalida", corpo.error.issues[0]?.message ?? "Entrada inválida.");

    // Uma issue do histórico vira uma só no Jira: a segunda tentativa devolve a que já existe.
    const existente = o.jira.obter(id);
    if (existente) {
      return reply.code(409).send({
        erro: { codigo: "ja_enviada", mensagem: `Esta issue já foi criada no Jira como ${existente.chave}.`, podeTentarDeNovo: false },
        envio: existente,
      });
    }
    const item = o.historico.obter(id)!;
    try {
      const criada = await o.cliente.criar({
        projeto: corpo.data.projeto,
        tipoId: corpo.data.tipoId,
        resumo: item.titulo,
        descricao: `${markdownParaJira(item.markdown)}\n\n----\n_Gerada pelo Issue Doc Generator (versão ${item.versoes})._`,
        rotulos: [ROTULO],
      });
      const envio = { chave: criada.chave, url: criada.url, enviadoPor: usuarioObrigatorio(request).email, enviadoEm: Date.now() };
      o.jira.registrar(id, envio);
      request.log.info({ evento: "jira_criada", id, chave: criada.chave, usuario: usuarioObrigatorio(request).email }, "jira: issue criada");
      const nome = o.usuarios.nomesPorEmail().get(envio.enviadoPor) ?? envio.enviadoPor;
      return reply.code(201).send({ envio: { ...envio, enviadoPor: nome } });
    } catch (e) {
      request.log.warn({ evento: "jira_falhou", id, detalhe: e instanceof Error ? e.message : String(e) }, "jira: não foi possível criar");
      return falhou(reply, e);
    }
  });
}
