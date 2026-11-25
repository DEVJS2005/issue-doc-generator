import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { montarApp } from "../src/app.js";
import { Limitador } from "../src/auth/limite.js";
import { esperaPara } from "../src/banco/travas.js";
import { carregarConfig } from "../src/config.js";
import { EMAIL_TESTE, entrar, SENHA_TESTE, USUARIO_TESTE } from "./fixtures/login.js";

const BIA = { email: "bia@exemplo.dev", senha: "senha-da-bia" };
const MIN = 60_000;
type App = Awaited<ReturnType<typeof montarApp>>;

function arquivoBanco() {
  return path.join(mkdtempSync(path.join(tmpdir(), "travas-")), "banco.db");
}

async function app(arquivo = ":memory:") {
  return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},${BIA.email}:${BIA.senha}`, ARQUIVO_BANCO: arquivo }));
}

// Cada pedido vem de um IP diferente: o teste mede só a trava por conta, não o limite por IP.
let ip = 0;
const login = (a: App, usuario: string, senha: string) =>
  a.inject({ method: "POST", url: "/api/login", payload: { usuario, senha }, remoteAddress: `203.0.113.${(ip++ % 250) + 1}` });

async function errar(a: App, usuario: string, vezes: number) {
  for (let i = 0; i < vezes; i++) expect((await login(a, usuario, "senha-errada")).statusCode).toBe(401);
}

describe("trava de login por conta, com espera progressiva", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("a 10ª falha trava a conta por 15 min, inclusive para a senha certa, e avisa quando tentar de novo", async () => {
    const a = await app();
    await errar(a, BIA.email, 10);
    const r = await login(a, BIA.email, BIA.senha);
    expect(r.statusCode).toBe(429);
    expect(r.json().erro.mensagem).toBe("Muitas tentativas de login. Aguarde alguns minutos.");
    expect(Number(r.headers["retry-after"])).toBe(15 * 60);
    // Outra conta não é afetada.
    expect((await login(a, EMAIL_TESTE, SENHA_TESTE)).statusCode).toBe(200);
    await a.close();
  });

  it("depois da espera, a senha certa entra e a contagem recomeça", async () => {
    const a = await app();
    await errar(a, BIA.email, 10);
    vi.advanceTimersByTime(15 * MIN + 1_000);
    expect((await login(a, BIA.email, BIA.senha)).statusCode).toBe(200);
    // Contagem zerada: mais 9 falhas ainda não travam.
    await errar(a, BIA.email, 9);
    expect((await login(a, BIA.email, BIA.senha)).statusCode).toBe(200);
    await a.close();
  });

  it("cada falha depois de uma trava dobra a espera, até 60 min", async () => {
    const a = await app();
    await errar(a, BIA.email, 10);
    const esperas: number[] = [];
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(61 * MIN);
      await errar(a, BIA.email, 1);
      esperas.push(Number((await login(a, BIA.email, BIA.senha)).headers["retry-after"]) / 60);
    }
    expect(esperas).toEqual([30, 60, 60]);
    await a.close();
  });

  it("a trava continua valendo depois de reiniciar o servidor", async () => {
    const arquivo = arquivoBanco();
    const a = await app(arquivo);
    await errar(a, BIA.email, 10);
    await a.close();
    const b = await app(arquivo);
    expect((await login(b, BIA.email, BIA.senha)).statusCode).toBe(429);
    await b.close();
  });

  it("vale para o nome ou e-mail digitado, com maiúsculas, e também para conta que não existe", async () => {
    const a = await app();
    await errar(a, BIA.email.toUpperCase(), 10);
    expect((await login(a, BIA.email, BIA.senha)).statusCode).toBe(429);
    await errar(a, "ninguem@exemplo.dev", 10);
    const r = await login(a, "ninguem@exemplo.dev", "qualquer");
    expect(r.statusCode).toBe(429);
    expect(r.json().erro.mensagem).toBe("Muitas tentativas de login. Aguarde alguns minutos.");
    await a.close();
  });

  it("24 h sem falhas apagam a contagem", async () => {
    const a = await app();
    await errar(a, BIA.email, 9);
    vi.advanceTimersByTime(25 * 60 * MIN);
    await errar(a, BIA.email, 9);
    expect((await login(a, BIA.email, BIA.senha)).statusCode).toBe(200);
    await a.close();
  });

  it("a auditoria registra a conta travada, com o texto digitado, as falhas e a espera", async () => {
    const a = await app();
    await errar(a, BIA.email, 10);
    const admin = await entrar(a);
    const eventos = (await a.inject({ method: "GET", url: "/api/admin/auditoria?acao=login_travado", headers: { cookie: admin } })).json().eventos as {
      quem: string;
      acao: string;
      detalhe: Record<string, unknown>;
      ip: string;
    }[];
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ acao: "login_travado", detalhe: { conta: BIA.email, falhas: 10, minutos: 15 } });
    expect(eventos[0].ip).toMatch(/^203\.0\.113\./);
    await a.close();
  });
});

describe("regras da espera e do limite em memória", () => {
  it("a espera começa em 15 min na 10ª falha e dobra até 60 min", () => {
    expect([1, 9, 10, 11, 12, 13, 50].map((f) => esperaPara(f) / MIN)).toEqual([0, 0, 15, 30, 60, 60, 60]);
  });

  it("o limite em memória descarta as entradas vencidas de tempos em tempos, mesmo com poucas chaves", () => {
    const l = new Limitador(10, 15 * MIN);
    const t0 = Date.UTC(2026, 10, 25);
    for (let i = 0; i < 50; i++) l.tentar(`10.0.0.${i}`, t0);
    expect(l.tamanho).toBe(50);
    l.tentar("10.0.1.1", t0 + 20 * MIN);
    expect(l.tamanho).toBe(1);
  });
});
