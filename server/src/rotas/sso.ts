import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ProvedorSso, EstadoSso } from "../auth/oidc.js";
import { lerCookie, type Sessoes } from "../auth/sessao.js";
import type { RepositorioSessoes } from "../banco/sessoes.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";
import { abrirSessao } from "./auth.js";

const COOKIE_ESTADO = "idg_sso";
const VALIDADE_ESTADO_MS = 10 * 60_000;

function seguro(request: FastifyRequest) {
  return request.protocol === "https";
}

/**
 * O cookie do estado é SameSite=Lax de propósito: a volta do provedor de identidade é uma
 * navegação vinda de outro site, e um cookie Strict não seria enviado nela.
 */
function cookieEstado(valor: string, maxAge: number, https: boolean) {
  return [`${COOKIE_ESTADO}=${valor}`, "Path=/api/sso", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`, ...(https ? ["Secure"] : [])].join("; ");
}

/** Volta para a tela com um código de erro que ela traduz (?sso=...). */
function voltarComErro(reply: FastifyReply, codigo: string, https: boolean) {
  reply.header("set-cookie", cookieEstado("", 0, https));
  return reply.redirect(`/?sso=${codigo}`);
}

export function registrarSso(
  app: FastifyInstance,
  o: {
    sso: ProvedorSso | null;
    /** Selo do estado do SSO (cookie curto e assinado). */
    sessoes: Sessoes;
    /** Sessão de login, aberta no banco ao voltar do provedor. */
    sessoesBanco: RepositorioSessoes;
    maxAgeSegundos: number;
    usuarios: RepositorioUsuarios;
    urlRetorno: string;
  },
) {
  app.get("/api/sso/iniciar", async (request, reply) => {
    if (!o.sso) return reply.code(404).send({ erro: { codigo: "sso_desligado", mensagem: "Login único não configurado.", podeTentarDeNovo: false } });
    try {
      const { url, estado } = await o.sso.iniciar();
      reply.header("set-cookie", cookieEstado(o.sessoes.selar(estado, VALIDADE_ESTADO_MS), VALIDADE_ESTADO_MS / 1000, seguro(request)));
      return reply.redirect(url);
    } catch (erro) {
      request.log.error({ evento: "sso_falhou", etapa: "iniciar", detalhe: String(erro) }, "sso: não foi possível falar com o provedor de identidade");
      return voltarComErro(reply, "indisponivel", seguro(request));
    }
  });

  app.get("/api/sso/retorno", async (request, reply) => {
    const https = seguro(request);
    if (!o.sso) return reply.redirect("/");
    const estado = o.sessoes.abrir<EstadoSso>(lerCookie(request.headers.cookie, COOKIE_ESTADO));
    if (!estado) return voltarComErro(reply, "expirado", https);

    let email: string | null;
    let emailVerificado: boolean;
    try {
      // A URL de retorno tem de bater com a registrada no provedor: usa a origem configurada.
      ({ email, emailVerificado } = await o.sso.concluir(new URL(request.url, o.urlRetorno), estado));
    } catch (erro) {
      request.log.warn({ evento: "sso_falhou", etapa: "retorno", detalhe: String(erro) }, "sso: resposta do provedor recusada");
      return voltarComErro(reply, "recusado", https);
    }
    if (!email || !emailVerificado) return voltarComErro(reply, "email", https);

    let usuario = o.usuarios.buscar(email);
    if (!usuario) {
      const dominio = email.split("@")[1] ?? "";
      if (!o.sso.dominiosAutoCadastro.includes(dominio)) {
        request.log.info({ evento: "sso_sem_cadastro", usuario: email }, "sso: e-mail sem cadastro");
        return voltarComErro(reply, "sem_cadastro", https);
      }
      // Senha aleatória e descartada: esse usuário entra só pelo SSO (um admin pode definir uma depois).
      usuario = o.usuarios.criar(email, randomBytes(32).toString("base64url"), false, { validar: false });
      request.log.info({ evento: "sso_cadastro", usuario: email }, "sso: usuário cadastrado no primeiro login");
    }
    if (!usuario.ativo) return voltarComErro(reply, "desativado", https);

    request.log.info({ evento: "login", via: "sso", usuario: usuario.email }, "login: ok (sso)");
    reply.header("set-cookie", [cookieEstado("", 0, https), ...abrirSessao(request, { sessoes: o.sessoesBanco, maxAgeSegundos: o.maxAgeSegundos }, usuario.email)]);
    return reply.redirect("/");
  });
}
