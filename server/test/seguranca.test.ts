import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig } from "../src/config.js";
import { CSP } from "../src/seguranca.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

function pastaWeb() {
  const dir = mkdtempSync(path.join(tmpdir(), "idg-web-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>t</title>");
  return dir;
}

async function app(env: NodeJS.ProcessEnv = {}) {
  return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},bia@exemplo.dev:senha-da-bia`, ...env }), { pastaWeb: pastaWeb() });
}

describe("cabeçalhos de segurança", () => {
  it("vão na tela e na API: CSP sem unsafe-inline, anti-iframe, nosniff e referrer", async () => {
    const a = await app();
    for (const url of ["/", "/api/saude", "/api/sessao"]) {
      const r = await a.inject({ method: "GET", url });
      expect(r.headers["content-security-policy"], url).toBe(CSP);
      expect(r.headers["x-frame-options"], url).toBe("DENY");
      expect(r.headers["x-content-type-options"], url).toBe("nosniff");
      expect(r.headers["referrer-policy"], url).toBe("strict-origin-when-cross-origin");
      expect(r.headers["strict-transport-security"], url).toBeUndefined();
    }
    expect(CSP).not.toContain("unsafe-inline");
    expect(CSP).toContain("frame-ancestors 'none'");
    await a.close();
  });

  it("HSTS só em HTTPS (atrás de proxy confiável)", async () => {
    const a = await app({ CONFIAR_PROXY: "true" });
    const r = await a.inject({ method: "GET", url: "/api/saude", headers: { "x-forwarded-proto": "https" } });
    expect(r.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
    await a.close();
  });

  it("a leitura pública mantém o no-referrer mais restrito", async () => {
    const a = await app();
    const r = await a.inject({ method: "GET", url: "/api/publico/token-qualquer" });
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    expect(r.headers["content-security-policy"]).toBe(CSP);
    await a.close();
  });
});

describe("erros", () => {
  it("erro interno não vaza a mensagem nem o stack", async () => {
    const a = await app();
    a.get("/api/teste-quebra", async () => {
      throw new Error("SQLITE_ERROR: no such table segredo_interno at C:\\caminho\\banco.ts");
    });
    // Rota nova da API exige login por padrão.
    const cookie = await entrar(a);
    const r = await a.inject({ method: "GET", url: "/api/teste-quebra", headers: { cookie } });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ erro: { codigo: "erro_interno", mensagem: "Algo deu errado no servidor. Tente de novo em instantes.", podeTentarDeNovo: true } });
    expect(r.body).not.toMatch(/SQLITE|segredo_interno|caminho/);
    await a.close();
  });

  it("JSON malformado e tipo de conteúdo errado respondem no formato da API", async () => {
    const a = await app();
    const malformado = await a.inject({ method: "POST", url: "/api/login", headers: { "content-type": "application/json" }, payload: "{nao é json" });
    expect(malformado.statusCode).toBe(400);
    expect(malformado.json().erro.mensagem).toBe("Pedido inválido.");
    const texto = await a.inject({ method: "POST", url: "/api/login", headers: { "content-type": "text/plain" }, payload: "usuario=qa" });
    expect(texto.statusCode).toBe(415);
    expect(texto.json().erro.mensagem).toBe("Tipo de conteúdo não aceito: envie JSON.");
    await a.close();
  });
});

describe("sessões", () => {
  async function idDe(a: Awaited<ReturnType<typeof app>>, admin: string, email: string) {
    const r = await a.inject({ method: "GET", url: "/api/admin/usuarios", headers: { cookie: admin } });
    return (r.json().usuarios as { id: number; email: string }[]).find((u) => u.email === email)!.id;
  }
  const sessao = (a: Awaited<ReturnType<typeof app>>, cookie: string) => a.inject({ method: "GET", url: "/api/sessao", headers: { cookie } });
  const esperar = () => new Promise((ok) => setTimeout(ok, 5));

  it("trocar a senha derruba as sessões abertas da pessoa; o login com a nova senha funciona", async () => {
    const a = await app();
    const admin = await entrar(a);
    const bia = await entrar(a, "bia@exemplo.dev", "senha-da-bia");
    expect((await sessao(a, bia)).statusCode).toBe(200);

    await esperar();
    const id = await idDe(a, admin, "bia@exemplo.dev");
    await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${id}`, headers: { cookie: admin }, payload: { senha: "senha-nova-da-bia" } });

    expect((await sessao(a, bia)).statusCode).toBe(401);
    expect((await sessao(a, admin)).statusCode).toBe(200);
    await esperar();
    const nova = await entrar(a, "bia@exemplo.dev", "senha-nova-da-bia");
    expect((await sessao(a, nova)).statusCode).toBe(200);
    await a.close();
  });

  it("desativar e reativar não ressuscita a sessão antiga", async () => {
    const a = await app();
    const admin = await entrar(a);
    const bia = await entrar(a, "bia@exemplo.dev", "senha-da-bia");
    await esperar();
    const id = await idDe(a, admin, "bia@exemplo.dev");
    await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${id}`, headers: { cookie: admin }, payload: { ativo: false } });
    await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${id}`, headers: { cookie: admin }, payload: { ativo: true } });
    expect((await sessao(a, bia)).statusCode).toBe(401);
    await a.close();
  });

  it("trocar só o nome ou o perfil não derruba a sessão", async () => {
    const a = await app();
    const admin = await entrar(a);
    const bia = await entrar(a, "bia@exemplo.dev", "senha-da-bia");
    await esperar();
    const id = await idDe(a, admin, "bia@exemplo.dev");
    await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${id}`, headers: { cookie: admin }, payload: { nome: "bia.souza", admin: true } });
    expect((await sessao(a, bia)).statusCode).toBe(200);
    await a.close();
  });
});

describe("limites antes do corpo", () => {
  it("sem login, a geração é recusada antes de ler o corpo (401, não 413 nem parse)", async () => {
    const a = await app();
    const r = await a.inject({ method: "POST", url: "/api/gerar", headers: { "content-type": "application/json" }, payload: "{".repeat(1000) });
    expect(r.statusCode).toBe(401);
    await a.close();
  });

  it("a leitura pública por link tem limite por IP", async () => {
    const a = await app();
    for (let i = 0; i < 60; i++) expect((await a.inject({ method: "GET", url: "/api/publico/nao-existe" })).statusCode).toBe(404);
    const bloqueado = await a.inject({ method: "GET", url: "/api/publico/nao-existe" });
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json().erro.codigo).toBe("muitas_tentativas");
    await a.close();
  });
});
