import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { montarApp } from "../src/app.js";
import { codigoDoPasso, deBase32, passoEm } from "../src/auth/totp.js";
import { abrirBanco } from "../src/banco/banco.js";
import { RepositorioMfa } from "../src/banco/mfa.js";
import { carregarConfig } from "../src/config.js";
import { EMAIL_TESTE, SENHA_TESTE, USUARIO_TESTE } from "./fixtures/login.js";

const COMUM = { email: "comum@exemplo.dev", senha: "senha-do-comum" };
const MIN = 60_000;
type App = Awaited<ReturnType<typeof montarApp>>;

async function app(env: NodeJS.ProcessEnv = {}) {
  return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},${COMUM.email}:${COMUM.senha}`, SEGREDO_SESSAO: "segredo-de-teste", ...env }));
}

/** Código TOTP de agora (no relógio simulado) para o segredo. */
const codigo = (segredo: string) => codigoDoPasso(deBase32(segredo), passoEm(Date.now()));
const cookieDe = (r: { headers: Record<string, unknown> }) => String([r.headers["set-cookie"]].flat()[0]).split(";")[0];

async function login(a: App, email = EMAIL_TESTE, senha = SENHA_TESTE) {
  return a.inject({ method: "POST", url: "/api/login", payload: { email, senha } });
}

async function entrar(a: App, email = EMAIL_TESTE, senha = SENHA_TESTE) {
  const r = await login(a, email, senha);
  expect(r.statusCode).toBe(200);
  return cookieDe(r);
}

/** Liga o MFA de quem está no cookie e devolve o segredo e os códigos de recuperação. */
async function ligarMfa(a: App, cookie: string) {
  const ini = await a.inject({ method: "POST", url: "/api/mfa/iniciar", headers: { cookie }, payload: {} });
  expect(ini.statusCode).toBe(200);
  const { segredo } = ini.json() as { segredo: string };
  const at = await a.inject({ method: "POST", url: "/api/mfa/ativar", headers: { cookie }, payload: { codigo: codigo(segredo) } });
  expect(at.statusCode).toBe(200);
  vi.advanceTimersByTime(31_000); // o próximo código é de outro passo
  return { segredo, codigos: at.json().codigos as string[] };
}

describe("verificação em duas etapas (TOTP)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("ligar: QR code gerado no servidor, código errado recusado, código certo liga e entrega 10 códigos de recuperação", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const ini = (await a.inject({ method: "POST", url: "/api/mfa/iniciar", headers: { cookie }, payload: {} })).json();
    expect(ini.uri).toMatch(/^otpauth:\/\/totp\/Issue%20Doc%20Generator%3Aqa%40exemplo\.dev\?secret=[A-Z2-7]{32}&issuer=/);
    expect(ini.qr).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(ini.qr.split(",")[1], "base64").toString()).toContain("<svg");
    const errado = await a.inject({ method: "POST", url: "/api/mfa/ativar", headers: { cookie }, payload: { codigo: "000000" } });
    expect(errado.statusCode).toBe(400);
    const certo = await a.inject({ method: "POST", url: "/api/mfa/ativar", headers: { cookie }, payload: { codigo: codigo(ini.segredo) } });
    expect(certo.json().codigos).toHaveLength(10);
    expect(certo.json().codigos[0]).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    expect((await a.inject({ method: "GET", url: "/api/mfa", headers: { cookie } })).json()).toEqual({ ativo: true, codigosRestantes: 10, exigido: false });
    await a.close();
  });

  it("com MFA ligado, a senha certa não abre sessão: o código abre, e o mesmo código não vale de novo", async () => {
    const a = await app();
    const { segredo } = await ligarMfa(a, await entrar(a));
    const senha = await login(a);
    expect(senha.statusCode).toBe(200);
    expect(senha.headers["set-cookie"]).toBeUndefined();
    const { mfa, desafio } = senha.json();
    expect(mfa).toBe(true);
    const c = codigo(segredo);
    const ok = await a.inject({ method: "POST", url: "/api/login/mfa", payload: { desafio, codigo: c } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().usuario.email).toBe(EMAIL_TESTE);
    expect((await a.inject({ method: "GET", url: "/api/sessao", headers: { cookie: cookieDe(ok) } })).statusCode).toBe(200);
    const repetido = await a.inject({ method: "POST", url: "/api/login/mfa", payload: { desafio, codigo: c } });
    expect(repetido.statusCode).toBe(401);
    await a.close();
  });

  it("código de recuperação entra uma vez só", async () => {
    const a = await app();
    const { codigos } = await ligarMfa(a, await entrar(a));
    const entrarCom = async (c: string) => a.inject({ method: "POST", url: "/api/login/mfa", payload: { desafio: (await login(a)).json().desafio, codigo: c } });
    const primeira = await entrarCom(codigos[0].toUpperCase());
    expect(primeira.statusCode).toBe(200);
    expect((await entrarCom(codigos[0])).statusCode).toBe(401);
    expect((await a.inject({ method: "GET", url: "/api/mfa", headers: { cookie: cookieDe(primeira) } })).json().codigosRestantes).toBe(9);
    await a.close();
  });

  it("desafio vencido ou adulterado é recusado; códigos errados contam na trava da conta", async () => {
    const a = await app();
    const { segredo } = await ligarMfa(a, await entrar(a));
    const { desafio } = (await login(a)).json();
    expect((await a.inject({ method: "POST", url: "/api/login/mfa", payload: { desafio: `${desafio}x`, codigo: codigo(segredo) } })).json().erro.codigo).toBe("desafio_expirado");
    vi.advanceTimersByTime(6 * MIN);
    expect((await a.inject({ method: "POST", url: "/api/login/mfa", payload: { desafio, codigo: codigo(segredo) } })).json().erro.codigo).toBe("desafio_expirado");

    const novo = (await login(a)).json().desafio;
    for (let i = 0; i < 10; i++) {
      const r = await a.inject({ method: "POST", url: "/api/login/mfa", payload: { desafio: novo, codigo: "000000" }, remoteAddress: `203.0.113.${i + 1}` });
      expect(r.statusCode).toBe(401);
    }
    const travado = await a.inject({ method: "POST", url: "/api/login/mfa", payload: { desafio: novo, codigo: codigo(segredo) }, remoteAddress: "203.0.113.99" });
    expect(travado.statusCode).toBe(429);
    await a.close();
  });

  it("o segredo fica cifrado no banco e não abre com outro SEGREDO_SESSAO", () => {
    const banco = abrirBanco(":memory:");
    const repo = new RepositorioMfa(banco, Buffer.alloc(32, 1));
    const segredo = repo.iniciar("qa@exemplo.dev")!;
    const guardado = (banco.prepare("SELECT segredo FROM mfa_totp").get() as { segredo: string }).segredo;
    expect(guardado).not.toContain(segredo);
    const outra = new RepositorioMfa(banco, Buffer.alloc(32, 2));
    expect(outra.ativar("qa@exemplo.dev", codigoDoPasso(deBase32(segredo), passoEm(Date.now())))).toBeNull();
    expect(repo.ativar("qa@exemplo.dev", codigoDoPasso(deBase32(segredo), passoEm(Date.now())))).toHaveLength(10);
    const hashes = (banco.prepare("SELECT hash FROM mfa_recuperacao").all() as { hash: string }[]).map((h) => h.hash);
    expect(hashes.every((h) => h.startsWith("scrypt$"))).toBe(true);
    banco.close();
  });

  it("ADMIN_EXIGE_MFA: admin sem MFA só configura o MFA; depois de ligar, usa tudo; não consegue desligar", async () => {
    const a = await app({ ADMIN_EXIGE_MFA: "true" });
    const r = await login(a);
    expect(r.json().precisaMfa).toBe(true);
    const cookie = cookieDe(r);
    expect((await a.inject({ method: "GET", url: "/api/sessao", headers: { cookie } })).json().precisaMfa).toBe(true);
    const bloqueado = await a.inject({ method: "GET", url: "/api/historico", headers: { cookie } });
    expect(bloqueado.statusCode).toBe(403);
    expect(bloqueado.json().erro.codigo).toBe("mfa_obrigatorio");
    expect((await a.inject({ method: "GET", url: "/api/mfa", headers: { cookie } })).json()).toMatchObject({ ativo: false, exigido: true });

    await ligarMfa(a, cookie);
    expect((await a.inject({ method: "GET", url: "/api/historico", headers: { cookie } })).statusCode).toBe(200);
    expect((await a.inject({ method: "GET", url: "/api/sessao", headers: { cookie } })).json().precisaMfa).toBe(false);
    expect((await a.inject({ method: "POST", url: "/api/mfa/desativar", headers: { cookie }, payload: {} })).statusCode).toBe(403);

    // Usuário comum não é obrigado.
    const comum = await login(a, COMUM.email, COMUM.senha);
    expect(comum.json().precisaMfa).toBe(false);
    expect((await a.inject({ method: "GET", url: "/api/historico", headers: { cookie: cookieDe(comum) } })).statusCode).toBe(200);
    await a.close();
  });

  it("baixar backup e criar ou promover admin pedem a senha de novo depois de 5 minutos", async () => {
    const a = await app();
    const cookie = await entrar(a);
    vi.advanceTimersByTime(6 * MIN);
    const pedir = (method: "GET" | "POST" | "PATCH", url: string, payload?: object) => a.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

    expect((await pedir("GET", "/api/admin/backups/issue-doc-generator-2026-11-25-120000000.db")).json().erro.codigo).toBe("reautenticar");
    expect((await pedir("POST", "/api/admin/usuarios", { email: "novo@exemplo.dev", senha: "senha-longa-1", admin: true })).json().erro.codigo).toBe("reautenticar");
    const usuarios = (await pedir("GET", "/api/admin/usuarios")).json().usuarios as { id: number; email: string }[];
    const idComum = usuarios.find((u) => u.email === COMUM.email)!.id;
    expect((await pedir("PATCH", `/api/admin/usuarios/${idComum}`, { admin: true })).json().erro.codigo).toBe("reautenticar");
    // Usuário comum e mudanças que não dão admin não pedem.
    expect((await pedir("POST", "/api/admin/usuarios", { email: "comum2@exemplo.dev", senha: "senha-longa-1", admin: false })).statusCode).toBe(201);

    expect((await pedir("POST", "/api/reautenticar", { senha: "errada" })).statusCode).toBe(401);
    expect((await pedir("POST", "/api/reautenticar", { senha: SENHA_TESTE })).statusCode).toBe(200);
    expect((await pedir("PATCH", `/api/admin/usuarios/${idComum}`, { admin: true })).statusCode).toBe(200);
    expect((await pedir("POST", "/api/admin/usuarios", { email: "novo@exemplo.dev", senha: "senha-longa-1", admin: true })).statusCode).toBe(201);
    // Backup em memória: passa da confirmação e cai no "não encontrado".
    expect((await pedir("GET", "/api/admin/backups/issue-doc-generator-2026-11-25-120000000.db")).statusCode).toBe(404);
    await a.close();
  });

  it("desligar o MFA pede a senha de novo; depois disso a senha basta", async () => {
    const a = await app();
    const cookie = await entrar(a);
    await ligarMfa(a, cookie);
    vi.advanceTimersByTime(6 * MIN);
    expect((await a.inject({ method: "POST", url: "/api/mfa/desativar", headers: { cookie }, payload: {} })).json().erro.codigo).toBe("reautenticar");
    await a.inject({ method: "POST", url: "/api/reautenticar", headers: { cookie }, payload: { senha: SENHA_TESTE } });
    expect((await a.inject({ method: "POST", url: "/api/mfa/desativar", headers: { cookie }, payload: {} })).statusCode).toBe(200);
    const r = await login(a);
    expect(r.json().mfa).toBeUndefined();
    expect(r.headers["set-cookie"]).toBeDefined();
    await a.close();
  });

  it("a auditoria registra o MFA ligado e conta o login só quando o código passa", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const { segredo } = await ligarMfa(a, cookie);
    const { desafio } = (await login(a)).json();
    await a.inject({ method: "POST", url: "/api/login/mfa", payload: { desafio, codigo: codigo(segredo) } });
    const eventos = (await a.inject({ method: "GET", url: "/api/admin/auditoria", headers: { cookie } })).json().eventos as { quem: string; acao: string }[];
    expect(eventos.filter((e) => e.acao === "mfa_ativado")).toEqual([expect.objectContaining({ quem: EMAIL_TESTE })]);
    // Duas entradas (a primeira e a com o código); a senha sozinha não conta, e nada como "(anônimo)".
    expect(eventos.filter((e) => e.acao === "login").map((e) => e.quem)).toEqual([EMAIL_TESTE, EMAIL_TESTE]);
    await a.close();
  });

  it("admin desliga o MFA de quem perdeu o celular (pede a senha de novo); a lista mostra quem tem MFA", async () => {
    const a = await app();
    const admin = await entrar(a);
    await ligarMfa(a, await entrar(a, COMUM.email, COMUM.senha));
    const lista = (await a.inject({ method: "GET", url: "/api/admin/usuarios", headers: { cookie: admin } })).json().usuarios as { id: number; email: string; mfa: boolean }[];
    const comum = lista.find((u) => u.email === COMUM.email)!;
    expect(comum.mfa).toBe(true);
    expect(lista.find((u) => u.email === EMAIL_TESTE)!.mfa).toBe(false);

    vi.advanceTimersByTime(6 * MIN);
    const url = `/api/admin/usuarios/${comum.id}/mfa/desligar`;
    expect((await a.inject({ method: "POST", url, headers: { cookie: admin }, payload: {} })).json().erro.codigo).toBe("reautenticar");
    await a.inject({ method: "POST", url: "/api/reautenticar", headers: { cookie: admin }, payload: { senha: SENHA_TESTE } });
    expect((await a.inject({ method: "POST", url, headers: { cookie: admin }, payload: {} })).statusCode).toBe(200);
    // Entra só com a senha de novo.
    const r = await login(a, COMUM.email, COMUM.senha);
    expect(r.json().mfa).toBeUndefined();
    expect(r.headers["set-cookie"]).toBeDefined();
    // Usuário comum não consegue desligar o de ninguém.
    expect((await a.inject({ method: "POST", url, headers: { cookie: cookieDe(r) }, payload: {} })).statusCode).toBe(403);
    await a.close();
  });

  it("as rotas de MFA têm limite de pedidos por minuto", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const status: number[] = [];
    for (let i = 0; i < 21; i++) status.push((await a.inject({ method: "GET", url: "/api/mfa", headers: { cookie } })).statusCode);
    expect(status.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(status[20]).toBe(429);
    await a.close();
  });
});

