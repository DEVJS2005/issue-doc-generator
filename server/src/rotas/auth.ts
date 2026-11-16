import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Autenticador, Usuario } from "../auth/autenticador.js";
import { Limitador } from "../auth/limite.js";
import { COOKIE_SESSAO, cookieSaida, cookieSessao, lerCookie, type Sessoes } from "../auth/sessao.js";

declare module "fastify" {
  interface FastifyRequest {
    usuario?: Usuario;
  }
}

const CorpoLogin = z.object({
  email: z.string().trim().min(1, "Informe o e-mail.").max(200),
  senha: z.string().min(1, "Informe a senha.").max(200),
});

export const ROTAS_PROTEGIDAS = ["/api/gerar", "/api/refinar", "/api/opcoes"];

function seguro(request: FastifyRequest) {
  return request.protocol === "https";
}

export function usuarioDaRequisicao(request: FastifyRequest, sessoes: Sessoes): Usuario | null {
  return sessoes.ler(lerCookie(request.headers.cookie, COOKIE_SESSAO));
}

/** Rotas de login e o bloqueio (401) das rotas da IA para quem não está logado. */
export function registrarAuth(app: FastifyInstance, o: { autenticador: Autenticador; sessoes: Sessoes }) {
  // 10 tentativas de login por IP a cada 15 minutos.
  const tentativas = new Limitador(10, 15 * 60_000);

  app.addHook("preHandler", async (request, reply) => {
    const caminho = request.url.split("?")[0];
    if (!ROTAS_PROTEGIDAS.includes(caminho)) return;
    const usuario = usuarioDaRequisicao(request, o.sessoes);
    if (!usuario) {
      return reply.code(401).send({
        erro: { codigo: "nao_autenticado", mensagem: "Entre com seu e-mail e senha para continuar.", podeTentarDeNovo: false },
      });
    }
    request.usuario = usuario;
  });

  app.post("/api/login", async (request, reply: FastifyReply) => {
    const limite = tentativas.tentar(request.ip);
    if (!limite.ok) {
      return reply.code(429).send({
        erro: { codigo: "muitas_tentativas", mensagem: "Muitas tentativas de login. Aguarde alguns minutos.", podeTentarDeNovo: true },
      });
    }
    const corpo = CorpoLogin.safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({
        erro: { codigo: "entrada_invalida", mensagem: corpo.error.issues[0]?.message ?? "Entrada inválida.", podeTentarDeNovo: false },
      });
    }
    const usuario = await o.autenticador.autenticar(corpo.data.email, corpo.data.senha);
    if (!usuario) {
      request.log.info({ evento: "login_falhou" }, "login: e-mail ou senha incorretos");
      return reply.code(401).send({
        erro: { codigo: "credenciais_invalidas", mensagem: "E-mail ou senha incorretos.", podeTentarDeNovo: true },
      });
    }
    tentativas.limpar(request.ip);
    request.log.info({ evento: "login", usuario: usuario.email }, "login: ok");
    reply.header("set-cookie", cookieSessao(o.sessoes.criar(usuario), o.sessoes.maxAgeSegundos, seguro(request)));
    return { usuario };
  });

  app.post("/api/sair", async (request, reply) => {
    reply.header("set-cookie", cookieSaida(seguro(request)));
    return { ok: true };
  });

  app.get("/api/sessao", async (request, reply) => {
    const usuario = usuarioDaRequisicao(request, o.sessoes);
    if (!usuario) return reply.code(401).send({ erro: { codigo: "nao_autenticado", mensagem: "Sem sessão.", podeTentarDeNovo: false } });
    return { usuario };
  });
}
