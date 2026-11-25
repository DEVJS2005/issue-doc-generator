import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { abrirBanco } from "../src/banco/banco.js";
import { RepositorioSessoes } from "../src/banco/sessoes.js";
import { carregarConfig } from "../src/config.js";
import { EMAIL_TESTE, SENHA_TESTE, USUARIO_TESTE } from "./fixtures/login.js";

const BIA = { email: "bia@exemplo.dev", senha: "senha-da-bia" };
type App = Awaited<ReturnType<typeof montarApp>>;

async function app(env: NodeJS.ProcessEnv = {}) {
  return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},${BIA.email}:${BIA.senha}`, ...env }));
}

/** Entra com um navegador "nomeado" e devolve o cookie da sessão. */
async function entrar(a: App, email = EMAIL_TESTE, senha = SENHA_TESTE, navegador = "Navegador de teste 1.0") {
  const r = await a.inject({ method: "POST", url: "/api/login", payload: { email, senha }, headers: { "user-agent": navegador } });
  expect(r.statusCode).toBe(200);
  const setCookie = [r.headers["set-cookie"]].flat()[0]!;
  return setCookie.split(";")[0];
}

const sessao = (a: App, cookie: string) => a.inject({ method: "GET", url: "/api/sessao", headers: { cookie } });
const lista = async (a: App, cookie: string) => {
  const r = await a.inject({ method: "GET", url: "/api/sessoes", headers: { cookie } });
  expect(r.statusCode).toBe(200);
  return r.json().sessoes as { id: number; navegador: string | null; ip: string | null; atual: boolean; criadaEm: number; ultimoUso: number }[];
};
const apagaCookie = (setCookie: string | string[] | undefined) => [setCookie].flat().some((c) => !!c && /Max-Age=0/.test(c));

describe("sessões revogáveis", () => {
  it("cada login abre uma sessão, listada com navegador, IP e qual é a deste dispositivo", async () => {
    const a = await app();
    const celular = await entrar(a, EMAIL_TESTE, SENHA_TESTE, "Celular de teste");
    const notebook = await entrar(a, EMAIL_TESTE, SENHA_TESTE, "Notebook de teste");
    const sessoes = await lista(a, notebook);
    expect(sessoes.map((s) => s.navegador).sort()).toEqual(["Celular de teste", "Notebook de teste"]);
    expect(sessoes.find((s) => s.atual)?.navegador).toBe("Notebook de teste");
    expect(sessoes.every((s) => s.ip === "127.0.0.1" && s.criadaEm > 0 && s.ultimoUso >= s.criadaEm)).toBe(true);
    expect((await lista(a, celular)).find((s) => s.atual)?.navegador).toBe("Celular de teste");
    await a.close();
  });

  it("Sair encerra a sessão no servidor: o cookie copiado antes não vale mais", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const outra = await entrar(a);
    const r = await a.inject({ method: "POST", url: "/api/sair", headers: { cookie }, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(apagaCookie(r.headers["set-cookie"])).toBe(true);
    expect((await sessao(a, cookie)).statusCode).toBe(401);
    // A outra sessão da mesma pessoa continua.
    expect((await sessao(a, outra)).statusCode).toBe(200);
    expect(await lista(a, outra)).toHaveLength(1);
    await a.close();
  });

  it("encerrar outra sessão pela lista derruba só aquela", async () => {
    const a = await app();
    const celular = await entrar(a, EMAIL_TESTE, SENHA_TESTE, "Celular de teste");
    const notebook = await entrar(a, EMAIL_TESTE, SENHA_TESTE, "Notebook de teste");
    const alvo = (await lista(a, notebook)).find((s) => !s.atual)!;
    const r = await a.inject({ method: "DELETE", url: `/api/sessoes/${alvo.id}`, headers: { cookie: notebook } });
    expect(r.json()).toEqual({ ok: true, atual: false });
    expect(apagaCookie(r.headers["set-cookie"])).toBe(false);
    expect((await sessao(a, celular)).statusCode).toBe(401);
    expect((await sessao(a, notebook)).statusCode).toBe(200);
    await a.close();
  });

  it("encerrar a própria sessão pela lista também apaga o cookie", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const minha = (await lista(a, cookie)).find((s) => s.atual)!;
    const r = await a.inject({ method: "DELETE", url: `/api/sessoes/${minha.id}`, headers: { cookie } });
    expect(r.json()).toEqual({ ok: true, atual: true });
    expect(apagaCookie(r.headers["set-cookie"])).toBe(true);
    expect((await sessao(a, cookie)).statusCode).toBe(401);
    await a.close();
  });

  it("Sair de todos os dispositivos encerra todas as sessões da pessoa, e só dela", async () => {
    const a = await app();
    const um = await entrar(a);
    const dois = await entrar(a);
    const bia = await entrar(a, BIA.email, BIA.senha);
    const r = await a.inject({ method: "POST", url: "/api/sessoes/encerrar-todas", headers: { cookie: um }, payload: {} });
    expect(r.json()).toEqual({ encerradas: 2 });
    expect(apagaCookie(r.headers["set-cookie"])).toBe(true);
    expect((await sessao(a, um)).statusCode).toBe(401);
    expect((await sessao(a, dois)).statusCode).toBe(401);
    expect((await sessao(a, bia)).statusCode).toBe(200);
    await a.close();
  });

  it("ninguém vê nem encerra a sessão de outra pessoa", async () => {
    const a = await app();
    const admin = await entrar(a);
    const bia = await entrar(a, BIA.email, BIA.senha);
    const daBia = (await lista(a, bia))[0];
    expect((await lista(a, admin)).map((s) => s.id)).not.toContain(daBia.id);
    const r = await a.inject({ method: "DELETE", url: `/api/sessoes/${daBia.id}`, headers: { cookie: admin } });
    expect(r.statusCode).toBe(404);
    expect((await sessao(a, bia)).statusCode).toBe(200);
    await a.close();
  });

  it("a lista e o encerramento exigem login", async () => {
    const a = await app();
    expect((await a.inject({ method: "GET", url: "/api/sessoes" })).statusCode).toBe(401);
    expect((await a.inject({ method: "DELETE", url: "/api/sessoes/1" })).statusCode).toBe(401);
    expect((await a.inject({ method: "POST", url: "/api/sessoes/encerrar-todas", payload: {} })).statusCode).toBe(401);
    await a.close();
  });

  it("trocar a senha tira as sessões antigas da lista; a nova aparece sozinha", async () => {
    const a = await app();
    const admin = await entrar(a);
    await entrar(a, BIA.email, BIA.senha);
    await entrar(a, BIA.email, BIA.senha);
    await new Promise((ok) => setTimeout(ok, 5));
    const usuarios = (await a.inject({ method: "GET", url: "/api/admin/usuarios", headers: { cookie: admin } })).json().usuarios as { id: number; email: string }[];
    const id = usuarios.find((u) => u.email === BIA.email)!.id;
    await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${id}`, headers: { cookie: admin }, payload: { senha: "senha-nova-da-bia" } });
    await new Promise((ok) => setTimeout(ok, 5));
    const nova = await entrar(a, BIA.email, "senha-nova-da-bia");
    expect(await lista(a, nova)).toHaveLength(1);
    await a.close();
  });

  it("a auditoria registra a saída, a sessão encerrada e o sair de todos", async () => {
    const a = await app();
    const admin = await entrar(a);
    const outra = await entrar(a);
    const alvo = (await lista(a, admin)).find((s) => !s.atual)!;
    await a.inject({ method: "DELETE", url: `/api/sessoes/${alvo.id}`, headers: { cookie: admin } });
    const bia = await entrar(a, BIA.email, BIA.senha);
    await a.inject({ method: "POST", url: "/api/sessoes/encerrar-todas", headers: { cookie: bia }, payload: {} });
    const bia2 = await entrar(a, BIA.email, BIA.senha);
    await a.inject({ method: "POST", url: "/api/sair", headers: { cookie: bia2 }, payload: {} });
    expect((await sessao(a, outra)).statusCode).toBe(401);

    const eventos = (await a.inject({ method: "GET", url: "/api/admin/auditoria", headers: { cookie: admin } })).json().eventos as { quem: string; acao: string; alvo: string | null }[];
    expect(eventos).toContainEqual(expect.objectContaining({ quem: EMAIL_TESTE, acao: "encerrar_sessao", alvo: String(alvo.id) }));
    expect(eventos).toContainEqual(expect.objectContaining({ quem: BIA.email, acao: "encerrar_todas" }));
    expect(eventos).toContainEqual(expect.objectContaining({ quem: BIA.email, acao: "sair" }));
    await a.close();
  });
});

describe("cookie da sessão em HTTPS", () => {
  const https = { "x-forwarded-proto": "https" };

  it("usa o prefixo __Host- com Secure, e o cookie sem prefixo não vale", async () => {
    const a = await app({ CONFIAR_PROXY: "true" });
    const r = await a.inject({ method: "POST", url: "/api/login", payload: { email: EMAIL_TESTE, senha: SENHA_TESTE }, headers: https });
    const cookies = [r.headers["set-cookie"]].flat() as string[];
    const sessaoHttps = cookies.find((c) => c.startsWith("__Host-idg_sessao="))!;
    expect(sessaoHttps).toMatch(/; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure$/);
    expect(sessaoHttps).not.toMatch(/Domain=/i);
    // O de nome antigo é apagado na entrada.
    expect(cookies.some((c) => c.startsWith("idg_sessao=;") && /Max-Age=0/.test(c))).toBe(true);

    const valor = sessaoHttps.split(";")[0].split("=")[1];
    expect((await a.inject({ method: "GET", url: "/api/sessao", headers: { ...https, cookie: `__Host-idg_sessao=${valor}` } })).statusCode).toBe(200);
    // O mesmo token com o nome sem prefixo (que um subdomínio conseguiria plantar) não vale em HTTPS.
    expect((await a.inject({ method: "GET", url: "/api/sessao", headers: { ...https, cookie: `idg_sessao=${valor}` } })).statusCode).toBe(401);
    await a.close();
  });
});

describe("o que fica guardado", () => {
  it("o banco guarda só o hash do token, e a sessão vence no prazo", () => {
    const banco = abrirBanco(":memory:");
    const repo = new RepositorioSessoes(banco, 60_000);
    const token = repo.criar("qa@exemplo.dev", { ip: "10.0.0.1", navegador: "x" }, 1_000);
    const linhas = banco.prepare("SELECT * FROM sessoes").all() as Record<string, unknown>[];
    expect(linhas).toHaveLength(1);
    expect(JSON.stringify(linhas)).not.toContain(token);
    expect(repo.buscar(token, 2_000)?.usuario).toBe("qa@exemplo.dev");
    expect(repo.buscar(token, 61_000)).toBeNull();
    expect(repo.buscar("token-que-nao-existe", 2_000)).toBeNull();
    banco.close();
  });

  it("sessão antiga, do formato de antes, não vale: entra de novo uma vez", async () => {
    const a = await app();
    // Formato antigo: "email|expira|emitida" assinado. Agora o cookie é um id aleatório do banco.
    const antigo = `${Buffer.from(`${EMAIL_TESTE}|9999999999999|1`).toString("base64url")}.assinatura`;
    expect((await sessao(a, `idg_sessao=${antigo}`)).statusCode).toBe(401);
    await a.close();
  });
});
