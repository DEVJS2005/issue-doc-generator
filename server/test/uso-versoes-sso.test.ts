import * as client from "openid-client";
import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { criarProvedorOidc, type EstadoSso, type ProvedorSso, type ResultadoSso } from "../src/auth/oidc.js";
import { carregarConfig, type Config } from "../src/config.js";
import type { Provedor } from "../src/ia/tipos.js";
import { issueExemplo } from "./fixtures/issue.js";
import { EMAIL_TESTE, entrar, USUARIO_TESTE } from "./fixtures/login.js";

const ENTRADA = { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" };
const COMUM = "comum@exemplo.dev:senha-comum";

function fabrica() {
  return (c: Config): Provedor => ({
    nome: c.provedor,
    modelo: c.modelo,
    async gerar({ usuario }) {
      if (usuario.includes("FALHAR")) throw Object.assign(new Error("429"), { status: 429 });
      return {
        texto: JSON.stringify(issueExemplo()),
        modelo: c.modelo,
        usouFallback: false,
        uso: { entrada: 1000, saida: 5000, cacheLeitura: 20000, cacheEscrita: 0 },
      };
    },
  });
}

async function app(env: NodeJS.ProcessEnv = {}, sso: ProvedorSso | null = null) {
  return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},${COMUM}`, ANTHROPIC_API_KEY: "sk-teste", ...env }), {
    fabricaProvedor: fabrica(),
    sso,
  });
}

function ultimoEvento(corpo: string) {
  const bloco = corpo.split("\n\n").filter((b) => b.startsWith("event:")).at(-1)!;
  return JSON.parse(bloco.split("\n")[1].slice(6));
}

describe("versões de uma issue", () => {
  it("devolve o Markdown de cada versão só para quem pode ver", async () => {
    const a = await app();
    const comum = await entrar(a, "comum@exemplo.dev", "senha-comum");
    const id = ultimoEvento((await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie: comum }, payload: ENTRADA })).body).historicoId;
    await a.inject({
      method: "POST",
      url: "/api/refinar",
      headers: { cookie: comum },
      payload: { entrada: ENTRADA, issue: issueExemplo(), ajuste: "Prioridade Alta", historicoId: id },
    });

    const v2 = (await a.inject({ method: "GET", url: `/api/historico/${id}/versoes/2`, headers: { cookie: comum } })).json().versao;
    expect(v2).toMatchObject({ numero: 2, ajuste: "Prioridade Alta" });
    expect(v2.markdown).toContain("# Limitar cupons por pedido");
    expect((await a.inject({ method: "GET", url: `/api/historico/${id}/versoes/9`, headers: { cookie: comum } })).statusCode).toBe(404);

    // Admin vê a versão de qualquer pessoa.
    const admin = await entrar(a);
    expect((await a.inject({ method: "GET", url: `/api/historico/${id}/versoes/1`, headers: { cookie: admin } })).statusCode).toBe(200);
  });
});

/** Provedor de identidade falso: devolve o que o teste mandar. */
function ssoFalso(resultado: ResultadoSso | Error, dominios: string[] = []): ProvedorSso {
  return {
    rotulo: "Entrar com a conta da empresa",
    dominiosAutoCadastro: dominios,
    async iniciar() {
      return { url: "https://idp.exemplo.dev/authorize?client_id=teste", estado: { verificador: "v", state: "s", nonce: "n" } };
    },
    async concluir(_url: URL, estado: EstadoSso) {
      if (estado.state !== "s") throw new Error("state");
      if (resultado instanceof Error) throw resultado;
      return resultado;
    },
  };
}

async function voltarDoSso(sso: ProvedorSso, env: NodeJS.ProcessEnv = {}) {
  const a = await app(env, sso);
  const ida = await a.inject({ method: "GET", url: "/api/sso/iniciar" });
  const cookieEstado = String(ida.headers["set-cookie"]).split(";")[0];
  const volta = await a.inject({ method: "GET", url: "/api/sso/retorno?code=abc&state=s", headers: { cookie: cookieEstado } });
  return { a, ida, volta };
}

describe("login único (SSO)", () => {
  it("a sessão anônima avisa qual é o botão de SSO", async () => {
    const a = await app({}, ssoFalso({ email: EMAIL_TESTE, emailVerificado: true }));
    expect((await a.inject({ method: "GET", url: "/api/sessao" })).json().sso).toBe("Entrar com a conta da empresa");
    expect((await (await app()).inject({ method: "GET", url: "/api/sessao" })).json().sso).toBeNull();
  });

  it("ida ao provedor guarda o estado num cookie Lax e a volta entra com o usuário cadastrado", async () => {
    const { a, ida, volta } = await voltarDoSso(ssoFalso({ email: "comum@exemplo.dev", emailVerificado: true }));
    expect(ida.statusCode).toBe(302);
    expect(ida.headers.location).toBe("https://idp.exemplo.dev/authorize?client_id=teste");
    expect(String(ida.headers["set-cookie"])).toMatch(/idg_sso=.+SameSite=Lax/);

    expect(volta.statusCode).toBe(302);
    expect(volta.headers.location).toBe("/");
    const cookies = ([] as string[]).concat(volta.headers["set-cookie"] as string | string[]);
    const sessao = cookies.find((c) => c.startsWith("idg_sessao="))!.split(";")[0];
    expect((await a.inject({ method: "GET", url: "/api/sessao", headers: { cookie: sessao } })).json().usuario).toEqual({
      email: "comum@exemplo.dev",
      nome: "comum",
      admin: false,
    });
  });

  it.each([
    ["sem o cookie de estado", null, "expirado"],
    ["e-mail não verificado", { email: "comum@exemplo.dev", emailVerificado: false }, "email"],
    ["e-mail sem cadastro e sem domínio liberado", { email: "novo@empresa.dev", emailVerificado: true }, "sem_cadastro"],
    ["provedor recusou o código", new Error("invalid_grant"), "recusado"],
  ] as const)("volta com erro: %s", async (_nome, resultado, codigo) => {
    if (resultado === null) {
      const a = await app({}, ssoFalso({ email: EMAIL_TESTE, emailVerificado: true }));
      const r = await a.inject({ method: "GET", url: "/api/sso/retorno?code=abc&state=s" });
      expect(r.headers.location).toBe(`/?sso=${codigo}`);
      return;
    }
    const { volta } = await voltarDoSso(ssoFalso(resultado));
    expect(volta.headers.location).toBe(`/?sso=${codigo}`);
  });

  it("e-mail de domínio liberado vira usuário comum no primeiro login", async () => {
    const { a, volta } = await voltarDoSso(ssoFalso({ email: "nova@empresa.dev", emailVerificado: true }, ["empresa.dev"]));
    expect(volta.headers.location).toBe("/");
    const admin = await entrar(a);
    const lista = (await a.inject({ method: "GET", url: "/api/admin/usuarios", headers: { cookie: admin } })).json().usuarios;
    expect(lista.find((u: { email: string }) => u.email === "nova@empresa.dev")).toMatchObject({ nome: "nova", admin: false, ativo: true });
  });

  it("usuário desativado não entra pelo SSO", async () => {
    const sso = ssoFalso({ email: "comum@exemplo.dev", emailVerificado: true });
    const a = await app({}, sso);
    const admin = await entrar(a);
    const lista = (await a.inject({ method: "GET", url: "/api/admin/usuarios", headers: { cookie: admin } })).json().usuarios;
    const comum = lista.find((u: { email: string }) => u.email === "comum@exemplo.dev");
    await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${comum.id}`, headers: { cookie: admin }, payload: { ativo: false } });
    const ida = await a.inject({ method: "GET", url: "/api/sso/iniciar" });
    const volta = await a.inject({ method: "GET", url: "/api/sso/retorno?code=abc&state=s", headers: { cookie: String(ida.headers["set-cookie"]).split(";")[0] } });
    expect(volta.headers.location).toBe("/?sso=desativado");
  });

  it("sem SSO configurado, /api/sso/iniciar responde 404", async () => {
    expect((await (await app()).inject({ method: "GET", url: "/api/sso/iniciar" })).statusCode).toBe(404);
  });

  it("OIDC monta a URL de autorização com PKCE S256, state, nonce e escopo openid (sem rede)", async () => {
    const config = new client.Configuration(
      { issuer: "https://idp.exemplo.dev", authorization_endpoint: "https://idp.exemplo.dev/authorize", token_endpoint: "https://idp.exemplo.dev/token" },
      "cliente-teste",
      "segredo-teste",
    );
    const oidc = criarProvedorOidc(
      { emissor: "https://idp.exemplo.dev", clienteId: "cliente-teste", clienteSegredo: "segredo-teste", urlRetorno: "https://app.exemplo.dev/api/sso/retorno", rotulo: "SSO", dominiosAutoCadastro: [] },
      async () => config,
    );
    const { url, estado } = await oidc.iniciar();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://idp.exemplo.dev/authorize");
    expect(u.searchParams.get("client_id")).toBe("cliente-teste");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.exemplo.dev/api/sso/retorno");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(await client.calculatePKCECodeChallenge(estado.verificador));
    expect(u.searchParams.get("state")).toBe(estado.state);
    expect(u.searchParams.get("nonce")).toBe(estado.nonce);
    expect(u.toString()).not.toContain("segredo-teste");
  });

  it("lê OIDC_* do .env só quando OIDC_EMISSOR está preenchido", () => {
    expect(carregarConfig({}).oidc).toBeNull();
    const c = carregarConfig({ OIDC_EMISSOR: "https://idp.exemplo.dev", OIDC_CLIENTE_ID: "x", OIDC_DOMINIOS_AUTOCADASTRO: "@Empresa.dev, outra.dev" });
    expect(c.oidc).toMatchObject({ urlRetorno: "http://localhost:3000/api/sso/retorno", rotulo: "Entrar com SSO", dominiosAutoCadastro: ["empresa.dev", "outra.dev"] });
  });
});
