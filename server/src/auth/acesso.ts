import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Usuario } from "./autenticador.js";

/**
 * Regras de acesso da API, sempre pelo padrão da rota registrada no Fastify
 * (`request.routeOptions.url`, ex.: "/api/admin/usuarios/:id"), nunca pela URL recebida.
 *
 * Negação por padrão: toda rota /api exige login, menos as desta lista. Rota nova entra protegida;
 * para ser pública, precisa ser acrescentada aqui (e o teste de autorização confere a lista).
 */
export const ROTAS_PUBLICAS: readonly string[] = [
  "/api/saude",
  "/api/login",
  "/api/login/mfa",
  "/api/sair",
  "/api/sessao",
  "/api/configurar",
  "/api/publico/:token",
];

/** Prefixos públicos: o login único (a volta do provedor chega sem sessão). */
export const PREFIXOS_PUBLICOS: readonly string[] = ["/api/sso/"];

/** Prefixo que exige perfil de admin, além do login. */
export const PREFIXO_ADMIN = "/api/admin";

const dentroDe = (rota: string, prefixo: string) => rota === prefixo || rota.startsWith(`${prefixo}/`);

export function rotaPublica(rota: string) {
  return ROTAS_PUBLICAS.includes(rota) || PREFIXOS_PUBLICOS.some((p) => rota.startsWith(p));
}

/** A rota (padrão registrado) é da API e não está entre as públicas. */
export function rotaExigeLogin(rota: string) {
  return dentroDe(rota, "/api") && !rotaPublica(rota);
}

export function rotaExigeAdmin(rota: string) {
  return dentroDe(rota, PREFIXO_ADMIN);
}

/**
 * O caminho parece da API? Usado só para escolher a resposta do 404 (JSON em vez da tela),
 * inclusive com maiúsculas ou percent-encoding. Não decide acesso.
 */
export function pareceApi(url: string) {
  const caminho = url.split("?")[0];
  let decodificado = caminho;
  try {
    decodificado = decodeURIComponent(caminho);
  } catch {
    // Encoding inválido: fica o caminho cru.
  }
  return /^\/+api(\/|;|$)/i.test(decodificado);
}

export const ERRO_NAO_AUTENTICADO = {
  codigo: "nao_autenticado",
  mensagem: "Entre com seu e-mail e senha para continuar.",
  podeTentarDeNovo: false,
};

export const ERRO_SEM_PERMISSAO = {
  codigo: "sem_permissao",
  mensagem: "Só administradores podem abrir esta área.",
  podeTentarDeNovo: false,
};

/** Vira 401 no formato da API pelo tratador de erros (seguranca.ts), nunca 500. */
export class ErroNaoAutenticado extends Error {
  readonly statusCode = 401;
  readonly erro = ERRO_NAO_AUTENTICADO;
  constructor() {
    super("pedido sem usuário autenticado");
  }
}

/** Usuário da sessão; sem ele, responde 401 (em vez de quebrar a rota). */
export function usuarioObrigatorio(request: FastifyRequest): Usuario {
  if (!request.usuario) throw new ErroNaoAutenticado();
  return request.usuario;
}

/**
 * Defesa em profundidade: as rotas registradas dentro de `instancia` (um plugin encapsulado)
 * exigem admin mesmo que o hook geral de login deixe passar por engano.
 */
export function exigirAdmin(instancia: FastifyInstance) {
  instancia.addHook("preHandler", async (request, reply) => {
    const usuario = request.usuario;
    if (!usuario) return reply.code(401).send({ erro: ERRO_NAO_AUTENTICADO });
    if (!usuario.admin) return reply.code(403).send({ erro: ERRO_SEM_PERMISSAO });
  });
}
