import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Ajustes } from "../ajustes/ajustes.js";
import { ErroValidacao } from "../banco/banco.js";
import type { RepositorioUso } from "../banco/uso.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";
import { ErroGeracao } from "../ia/erros.js";
import { listarModelos } from "../ia/modelos.js";
import type { NomeProvedor } from "../ia/tipos.js";

function falhou(reply: FastifyReply, e: unknown) {
  if (e instanceof ErroValidacao) {
    const status = e.codigo === "nao_encontrado" ? 404 : e.codigo === "email_em_uso" ? 409 : 400;
    return reply.code(status).send({ erro: { codigo: e.codigo, mensagem: e.message, podeTentarDeNovo: false } });
  }
  throw e;
}

const CorpoNovoUsuario = z.object({
  email: z.string().max(200),
  senha: z.string().max(200),
  admin: z.boolean().default(false),
});

const CorpoAlterarUsuario = z.object({
  admin: z.boolean().optional(),
  ativo: z.boolean().optional(),
  senha: z.string().max(200).optional(),
});

const PROVEDORES = ["anthropic", "openai", "openai_compativel", "gemini"] as const;

/** /api/admin/*: o hook de auth já garante login e perfil de admin. */
export function registrarAdmin(app: FastifyInstance, o: { ajustes: Ajustes; usuarios: RepositorioUsuarios; uso: RepositorioUso }) {
  const estado = () => ({ valores: o.ajustes.valores(), provedores: o.ajustes.provedores(), alteracoes: o.ajustes.alteracoes() });

  // Painel de uso: ?dias=1..365 (padrão 30).
  app.get("/api/admin/uso", async (request) => {
    const dias = Math.min(365, Math.max(1, Math.trunc(Number((request.query as { dias?: string }).dias) || 30)));
    return { dias, ...o.uso.resumo(dias) };
  });

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
      const usuario = o.usuarios.criar(corpo.data.email, corpo.data.senha, corpo.data.admin);
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
