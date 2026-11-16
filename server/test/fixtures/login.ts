import type { FastifyInstance } from "fastify";

// Usuário fictício, só para os testes.
export const EMAIL_TESTE = "qa@exemplo.dev";
export const SENHA_TESTE = "senha-de-teste";
export const USUARIO_TESTE = `${EMAIL_TESTE}:${SENHA_TESTE}`;

/** Faz login e devolve o cookie de sessão para as próximas requisições. */
export async function entrar(app: FastifyInstance, email = EMAIL_TESTE, senha = SENHA_TESTE): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/api/login", payload: { email, senha } });
  const setCookie = r.headers["set-cookie"];
  const valor = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (r.statusCode !== 200 || !valor) throw new Error(`login falhou: ${r.statusCode} ${r.body}`);
  return valor.split(";")[0];
}
