import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Autenticador, Usuario } from "../auth/autenticador.js";
import { Limitador } from "../auth/limite.js";
import { COOKIE_SESSAO, cookieSaida, cookieSessao, lerCookie, type Sessoes } from "../auth/sessao.js";
import { ErroValidacao } from "../banco/banco.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";

declare module "fastify" {
  interface FastifyRequest {
    usuario?: Usuario;
  }
}

// `usuario` é o nome de usuário ou o e-mail; `email` continua aceito por compatibilidade.
const CorpoLogin = z
  .object({
    usuario: z.string().trim().max(200).optional(),
    email: z.string().trim().max(200).optional(),
    senha: z.string().min(1, "Informe a senha.").max(200),
  })
  .transform((c) => ({ login: c.usuario || c.email || "", senha: c.senha }))
  .refine((c) => c.login.length > 0, { message: "Informe o usuário ou o e-mail." });

const CorpoConfigurar = z.object({
  codigo: z.string().min(1).max(200),
  nome: z.string().trim().max(40).optional(),
  email: z.string().trim().min(1, "Informe o e-mail.").max(200),
  senha: z.string().max(200),
});

/** Prefixos que exigem login; /api/admin exige também perfil de admin. */
const PROTEGIDAS = ["/api/gerar", "/api/refinar", "/api/opcoes", "/api/historico", "/api/admin"];

function seguro(request: FastifyRequest) {
  return request.protocol === "https";
}

function erro(codigo: string, mensagem: string, podeTentarDeNovo = false) {
  return { erro: { codigo, mensagem, podeTentarDeNovo } };
}

export type OpcoesAuth = {
  autenticador: Autenticador;
  sessoes: Sessoes;
  usuarios: RepositorioUsuarios;
  /** Código de uso único para criar o 1º admin; null quando já existe usuário. */
  codigoConfiguracao: { atual: string | null };
  /** Texto do botão de login único; null quando o SSO está desligado. */
  rotuloSso: string | null;
};

/**
 * A sessão leva só o e-mail. A cada pedido o usuário é relido do banco: desativar alguém ou
 * tirar o perfil de admin vale na hora, sem esperar a sessão vencer.
 */
export function usuarioDaRequisicao(request: FastifyRequest, o: OpcoesAuth): Usuario | null {
  const sessao = o.sessoes.ler(lerCookie(request.headers.cookie, COOKIE_SESSAO));
  if (!sessao) return null;
  const u = o.usuarios.buscar(sessao.email);
  return u && u.ativo ? { email: u.email, nome: u.nome, admin: u.admin } : null;
}

export function registrarAuth(app: FastifyInstance, o: OpcoesAuth) {
  // 10 tentativas por IP a cada 15 minutos, para login e para a configuração inicial.
  const tentativas = new Limitador(10, 15 * 60_000);

  app.addHook("preHandler", async (request, reply) => {
    const caminho = request.url.split("?")[0];
    if (!PROTEGIDAS.some((p) => caminho === p || caminho.startsWith(`${p}/`))) return;
    const usuario = usuarioDaRequisicao(request, o);
    if (!usuario) return reply.code(401).send(erro("nao_autenticado", "Entre com seu e-mail e senha para continuar."));
    if (caminho.startsWith("/api/admin") && !usuario.admin) {
      return reply.code(403).send(erro("sem_permissao", "Só administradores podem abrir esta área."));
    }
    request.usuario = usuario;
  });

  function entrar(request: FastifyRequest, reply: FastifyReply, usuario: Usuario) {
    request.usuario = usuario; // para a auditoria saber quem entrou

    reply.header("set-cookie", cookieSessao(o.sessoes.criar(usuario), o.sessoes.maxAgeSegundos, seguro(request)));
    return { usuario };
  }

  app.post("/api/login", async (request, reply) => {
    if (!tentativas.tentar(request.ip).ok) {
      return reply.code(429).send(erro("muitas_tentativas", "Muitas tentativas de login. Aguarde alguns minutos.", true));
    }
    const corpo = CorpoLogin.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", corpo.error.issues[0]?.message ?? "Entrada inválida."));
    const usuario = await o.autenticador.autenticar(corpo.data.login, corpo.data.senha);
    if (!usuario) {
      request.log.info({ evento: "login_falhou" }, "login: usuário ou senha incorretos");
      return reply.code(401).send(erro("credenciais_invalidas", "Usuário ou senha incorretos.", true));
    }
    tentativas.limpar(request.ip);
    request.log.info({ evento: "login", usuario: usuario.email }, "login: ok");
    return entrar(request, reply, usuario);
  });

  app.post("/api/sair", async (request, reply) => {
    reply.header("set-cookie", cookieSaida(seguro(request)));
    return { ok: true };
  });

  app.get("/api/sessao", async (request, reply) => {
    const usuario = usuarioDaRequisicao(request, o);
    if (!usuario) {
      return reply.code(401).send({
        ...erro("nao_autenticado", "Sem sessão."),
        precisaConfigurar: o.codigoConfiguracao.atual !== null,
        sso: o.rotuloSso,
      });
    }
    return { usuario };
  });

  // Configuração inicial: só existe enquanto o banco não tem nenhum usuário.
  app.post("/api/configurar", async (request, reply) => {
    if (!tentativas.tentar(request.ip).ok) {
      return reply.code(429).send(erro("muitas_tentativas", "Muitas tentativas. Aguarde alguns minutos.", true));
    }
    const esperado = o.codigoConfiguracao.atual;
    if (!esperado || o.usuarios.contar() > 0) {
      return reply.code(409).send(erro("ja_configurado", "O primeiro administrador já foi criado. Entre com e-mail e senha."));
    }
    const corpo = CorpoConfigurar.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", corpo.error.issues[0]?.message ?? "Entrada inválida."));
    const a = Buffer.from(corpo.data.codigo);
    const b = Buffer.from(esperado);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return reply.code(403).send(erro("codigo_invalido", "Código de configuração inválido. Use o link que aparece no log do servidor."));
    }
    try {
      const u = o.usuarios.criar(corpo.data.email, corpo.data.senha, true, { nome: corpo.data.nome });
      o.codigoConfiguracao.atual = null;
      request.log.info({ evento: "primeiro_admin", usuario: u.email }, "configuração inicial: primeiro admin criado");
      return entrar(request, reply, { email: u.email, nome: u.nome, admin: true });
    } catch (e) {
      if (e instanceof ErroValidacao) return reply.code(400).send(erro(e.codigo, e.message));
      throw e;
    }
  });
}
