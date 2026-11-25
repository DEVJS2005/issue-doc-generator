import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig } from "../src/config.js";
import { AutenticadorFalso } from "./fixtures/autenticador.js";
import { EMAIL_TESTE, SENHA_TESTE, USUARIO_TESTE } from "./fixtures/login.js";

const ORIGEM = "https://issues.exemplo.dev";
const DOMINIO = "issues.exemplo.dev";
type App = Awaited<ReturnType<typeof montarApp>>;
const abertos: App[] = [];

async function app(env: NodeJS.ProcessEnv = { URL_PUBLICA: ORIGEM }) {
  const a = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE, SEGREDO_SESSAO: "segredo-de-teste", ...env }));
  abertos.push(a);
  return a;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
});
afterEach(async () => {
  vi.useRealTimers();
  while (abertos.length) await abertos.pop()!.close();
});
// O login conta como senha confirmada por 5 minutos; passado isso, a ação sensível pede de novo.
const passarDaReautenticacao = () => vi.advanceTimersByTime(6 * 60_000);

const cookieDe = (r: { headers: Record<string, unknown> }) => String([r.headers["set-cookie"]].flat()[0]).split(";")[0];

async function entrar(a: App) {
  const r = await a.inject({ method: "POST", url: "/api/login", payload: { email: EMAIL_TESTE, senha: SENHA_TESTE } });
  expect(r.statusCode).toBe(200);
  return cookieDe(r);
}

/** Cadastra uma chave (com a senha confirmada) e devolve o autenticador que a guarda. */
async function cadastrar(a: App, cookie: string, nome?: string) {
  expect((await a.inject({ method: "POST", url: "/api/reautenticar", headers: { cookie }, payload: { senha: SENHA_TESTE } })).statusCode).toBe(200);
  const ini = await a.inject({ method: "POST", url: "/api/chaves-acesso/registro/iniciar", headers: { cookie }, payload: {} });
  expect(ini.statusCode).toBe(200);
  const { opcoes, token } = ini.json();
  const aparelho = new AutenticadorFalso(ORIGEM, DOMINIO);
  const fim = await a.inject({ method: "POST", url: "/api/chaves-acesso/registro/concluir", headers: { cookie }, payload: { token, resposta: aparelho.cadastrar(opcoes), nome } });
  expect(fim.statusCode).toBe(201);
  return aparelho;
}

async function loginComChave(a: App, aparelho: AutenticadorFalso, origem = ORIGEM) {
  const ini = (await a.inject({ method: "POST", url: "/api/login/chave/iniciar", payload: {} })).json();
  return a.inject({ method: "POST", url: "/api/login/chave/concluir", payload: { token: ini.token, resposta: aparelho.entrar(ini.opcoes, origem) } });
}

describe("chave de acesso (passkey)", () => {
  it("sem URL_PUBLICA fica desligada: a tela não oferece e as rotas respondem 404", async () => {
    const a = await app({});
    expect((await a.inject({ method: "GET", url: "/api/sessao" })).json()).toMatchObject({ chaveAcesso: null });
    expect((await a.inject({ method: "POST", url: "/api/login/chave/iniciar", payload: {} })).statusCode).toBe(404);
    const cookie = await entrar(a);
    expect((await a.inject({ method: "GET", url: "/api/chaves-acesso", headers: { cookie } })).json()).toEqual({ disponivel: false, chaves: [] });
  });

  it("URL_PUBLICA aceita https com domínio ou http://localhost; IP e http fora do localhost impedem o servidor de subir", () => {
    expect(carregarConfig({ URL_PUBLICA: ORIGEM }).urlPublica).toEqual({ origem: ORIGEM, dominio: DOMINIO });
    expect(carregarConfig({ URL_PUBLICA: "http://localhost:3555/" }).urlPublica).toEqual({ origem: "http://localhost:3555", dominio: "localhost" });
    for (const ruim of ["http://issues.exemplo.dev", "https://10.0.0.5", "issues.exemplo.dev"]) {
      expect(() => carregarConfig({ URL_PUBLICA: ruim }), ruim).toThrow(/URL_PUBLICA/);
    }
  });

  it("cadastrar pede a senha confirmada há pouco", async () => {
    const a = await app();
    const cookie = await entrar(a);
    passarDaReautenticacao();
    const r = await a.inject({ method: "POST", url: "/api/chaves-acesso/registro/iniciar", headers: { cookie }, payload: {} });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro.codigo).toBe("reautenticar");
  });

  it("cadastra, lista e entra sem senha; a sessão já vale como segundo fator", async () => {
    const a = await app();
    expect((await a.inject({ method: "GET", url: "/api/sessao" })).json()).toMatchObject({ chaveAcesso: ORIGEM });
    const cookie = await entrar(a);
    const aparelho = await cadastrar(a, cookie, "Notebook do trabalho");
    const lista = (await a.inject({ method: "GET", url: "/api/chaves-acesso", headers: { cookie } })).json();
    expect(lista).toMatchObject({ disponivel: true, chaves: [{ id: aparelho.id, nome: "Notebook do trabalho", ultimoUso: null }] });

    const r = await loginComChave(a, aparelho);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ usuario: { email: EMAIL_TESTE }, precisaMfa: false });
    const sessao = await a.inject({ method: "GET", url: "/api/sessao", headers: { cookie: cookieDe(r) } });
    expect(sessao.json().usuario.email).toBe(EMAIL_TESTE);
    const depois = (await a.inject({ method: "GET", url: "/api/chaves-acesso", headers: { cookie } })).json();
    expect(depois.chaves[0].ultimoUso).toEqual(expect.any(Number));
  });

  it("recusa resposta de outro site, desafio repetido e chave que não está cadastrada", async () => {
    const a = await app();
    const aparelho = await cadastrar(a, await entrar(a));
    expect((await loginComChave(a, aparelho, "https://site-falso.exemplo.dev")).statusCode).toBe(401);
    expect((await loginComChave(a, new AutenticadorFalso(ORIGEM, DOMINIO))).statusCode).toBe(401);

    const ini = (await a.inject({ method: "POST", url: "/api/login/chave/iniciar", payload: {} })).json();
    const payload = { token: ini.token, resposta: aparelho.entrar(ini.opcoes) };
    expect((await a.inject({ method: "POST", url: "/api/login/chave/concluir", payload })).statusCode).toBe(200);
    const repetido = await a.inject({ method: "POST", url: "/api/login/chave/concluir", payload });
    expect(repetido.statusCode).toBe(401);
    expect(repetido.json().erro.codigo).toBe("desafio_expirado");
  });

  it("remover pede a senha confirmada; depois de removida a chave não entra mais", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const aparelho = await cadastrar(a, cookie);
    passarDaReautenticacao();
    expect((await a.inject({ method: "DELETE", url: `/api/chaves-acesso/${aparelho.id}`, headers: { cookie } })).statusCode).toBe(403);
    await a.inject({ method: "POST", url: "/api/reautenticar", headers: { cookie }, payload: { senha: SENHA_TESTE } });
    expect((await a.inject({ method: "DELETE", url: `/api/chaves-acesso/${aparelho.id}`, headers: { cookie } })).statusCode).toBe(200);
    expect((await a.inject({ method: "GET", url: "/api/chaves-acesso", headers: { cookie } })).json().chaves).toEqual([]);
    expect((await loginComChave(a, aparelho)).statusCode).toBe(401);
  });

  it("a auditoria registra o cadastro, a remoção e o login com chave", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const aparelho = await cadastrar(a, cookie);
    expect((await loginComChave(a, aparelho)).statusCode).toBe(200);
    await a.inject({ method: "DELETE", url: `/api/chaves-acesso/${aparelho.id}`, headers: { cookie } });
    const r = await a.inject({ method: "GET", url: "/api/admin/auditoria", headers: { cookie } });
    const acoes = (r.json().eventos as { acao: string }[]).map((e) => e.acao);
    expect(acoes).toEqual(expect.arrayContaining(["chave_acesso_criada", "chave_acesso_removida", "login"]));
  });
});
