import { createReadStream } from "node:fs";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Ajustes } from "../ajustes/ajustes.js";
import { ACOES_AUDITORIA, type RepositorioAuditoria } from "../banco/auditoria.js";
import type { Backups } from "../banco/backup.js";
import { ErroValidacao } from "../banco/banco.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";
import { ErroGeracao } from "../ia/erros.js";
import { listarModelos } from "../ia/modelos.js";
import type { NomeProvedor } from "../ia/tipos.js";

function falhou(reply: FastifyReply, e: unknown) {
  if (e instanceof ErroValidacao) {
    const status = e.codigo === "nao_encontrado" ? 404 : e.codigo === "email_em_uso" || e.codigo === "nome_em_uso" ? 409 : 400;
    return reply.code(status).send({ erro: { codigo: e.codigo, mensagem: e.message, podeTentarDeNovo: false } });
  }
  throw e;
}

const CorpoNovoUsuario = z.object({
  nome: z.string().max(40).optional(),
  email: z.string().max(200),
  senha: z.string().max(200),
  admin: z.boolean().default(false),
});

const CorpoAlterarUsuario = z.object({
  nome: z.string().max(40).optional(),
  admin: z.boolean().optional(),
  ativo: z.boolean().optional(),
  senha: z.string().max(200).optional(),
});

const PROVEDORES = ["anthropic", "openai", "openai_compativel", "gemini"] as const;

/** /api/admin/*: o hook de auth já garante login e perfil de admin. */
const FiltroAuditoria = z.object({
  quem: z.string().trim().max(200).optional(),
  acao: z.enum(ACOES_AUDITORIA).optional(),
  de: z.coerce.number().int().nonnegative().optional(),
  ate: z.coerce.number().int().nonnegative().optional(),
  antesDe: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
});

export function registrarAdmin(
  app: FastifyInstance,
  o: { ajustes: Ajustes; usuarios: RepositorioUsuarios; backups: Backups; auditoria: RepositorioAuditoria },
) {
  // Auditoria: quem fez o quê, mais novo primeiro, com filtros e paginação por cursor.
  app.get("/api/admin/auditoria", async (request, reply) => {
    const filtro = FiltroAuditoria.safeParse(request.query);
    if (!filtro.success) return falhou(reply, new ErroValidacao("Filtro da auditoria inválido."));
    return o.auditoria.listar(filtro.data);
  });

  // Backups do banco: lista, "Fazer backup agora" e download. Só o admin chega aqui, e com limite
  // de pedidos, porque cada um lê ou grava no disco.
  const limite = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

  app.get("/api/admin/backups", limite, async () => ({
    disponivel: o.backups.disponivel,
    copias: o.ajustes.valores().backupCopias,
    backups: o.backups.listar(),
  }));

  app.post("/api/admin/backups", limite, async (request, reply) => {
    if (!o.backups.disponivel) {
      return reply
        .code(409)
        .send({ erro: { codigo: "backup_indisponivel", mensagem: "Backup indisponível: o banco está em memória.", podeTentarDeNovo: false } });
    }
    const backup = o.backups.fazer();
    o.backups.podar(o.ajustes.valores().backupCopias);
    request.log.info({ evento: "backup", nome: backup.nome, usuario: request.usuario!.email }, "administração: backup feito");
    return reply.code(201).send({ backup });
  });

  app.get("/api/admin/backups/:nome", limite, async (request, reply) => {
    const nome = (request.params as { nome: string }).nome;
    const arquivo = o.backups.caminho(nome);
    if (!arquivo) return reply.code(404).send({ erro: { codigo: "nao_encontrado", mensagem: "Backup não encontrado.", podeTentarDeNovo: false } });
    request.log.info({ evento: "backup_baixado", nome, usuario: request.usuario!.email }, "administração: backup baixado");
    return reply
      .header("content-type", "application/vnd.sqlite3")
      .header("content-disposition", `attachment; filename="${nome}"`)
      .header("cache-control", "no-store")
      .send(createReadStream(arquivo));
  });

  const estado = () => ({ valores: o.ajustes.valores(), provedores: o.ajustes.provedores(), alteracoes: o.ajustes.alteracoes() });

  app.get("/api/admin/ajustes", async () => estado());

  app.put("/api/admin/ajustes", async (request, reply) => {
    try {
      o.ajustes.salvar(request.body, request.usuario!.email);
      request.log.info({ evento: "ajustes_salvos", usuario: request.usuario!.email, valores: o.ajustes.valores() }, "administração: ajustes salvos");
      return estado();
    } catch (e) {
      return falhou(reply, e);
    }
  });

  app.get("/api/admin/modelos", async (request, reply) => {
    const provedor = (request.query as { provedor?: string }).provedor;
    if (!PROVEDORES.includes(provedor as NomeProvedor)) {
      return reply.code(400).send({ erro: { codigo: "entrada_invalida", mensagem: "Provedor inválido.", podeTentarDeNovo: false } });
    }
    try {
      return { modelos: await listarModelos(o.ajustes.config(), provedor as NomeProvedor) };
    } catch (e) {
      const erro = e instanceof ErroGeracao ? e : new ErroGeracao("desconhecido");
      request.log.warn({ evento: "listar_modelos_falhou", provedor, codigo: erro.codigo, detalhe: erro.detalhe }, "administração: listar modelos falhou");
      return reply.code(502).send({ erro: erro.paraTela() });
    }
  });

  app.get("/api/admin/usuarios", async () => ({ usuarios: o.usuarios.listar() }));

  app.post("/api/admin/usuarios", async (request, reply) => {
    const corpo = CorpoNovoUsuario.safeParse(request.body);
    if (!corpo.success) return falhou(reply, new ErroValidacao("Dados do usuário inválidos."));
    try {
      const usuario = o.usuarios.criar(corpo.data.email, corpo.data.senha, corpo.data.admin, { nome: corpo.data.nome });
      request.log.info({ evento: "usuario_criado", por: request.usuario!.email, usuario: usuario.email, admin: usuario.admin }, "administração: usuário criado");
      return reply.code(201).send({ usuario });
    } catch (e) {
      return falhou(reply, e);
    }
  });

  app.patch("/api/admin/usuarios/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const corpo = CorpoAlterarUsuario.safeParse(request.body);
    if (!Number.isInteger(id) || !corpo.success) return falhou(reply, new ErroValidacao("Dados do usuário inválidos."));
    try {
      const usuario = o.usuarios.atualizar(id, corpo.data);
      request.log.info(
        { evento: "usuario_alterado", por: request.usuario!.email, usuario: usuario.email, admin: usuario.admin, ativo: usuario.ativo, trocouSenha: corpo.data.senha !== undefined },
        "administração: usuário alterado",
      );
      return { usuario };
    } catch (e) {
      return falhou(reply, e);
    }
  });
}
