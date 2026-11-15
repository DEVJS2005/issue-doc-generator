import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig } from "../src/config.js";

describe("configuração", () => {
  it("usa os padrões quando o ambiente está vazio", () => {
    const c = carregarConfig({});
    expect(c.modelo).toBe("claude-opus-5-5");
    expect(c.esforco).toBe("medium");
    expect(c.limitePorHora).toBe(30);
    expect(c.porta).toBe(3000);
    expect(c.registrarDescricao).toBe(false);
  });

  it("lê listas separadas por vírgula", () => {
    const c = carregarConfig({ PRODUTOS: " Loja, App ,", USUARIOS_PERMITIDOS: "a@x.dev,b@x.dev" });
    expect(c.produtos).toEqual(["Loja", "App"]);
    expect(c.usuariosPermitidos).toEqual(["a@x.dev", "b@x.dev"]);
  });

  it("recusa esforço inválido", () => {
    expect(() => carregarConfig({ ESFORCO: "turbo" })).toThrow();
  });

  it("exige MODELO para provedores sem modelo padrão", () => {
    expect(() => carregarConfig({ PROVEDOR: "openai" })).toThrow(/MODELO é obrigatório/);
    expect(() => carregarConfig({ PROVEDOR: "gemini" })).toThrow(/MODELO é obrigatório/);
    expect(carregarConfig({ PROVEDOR: "openai", MODELO: "modelo-x" }).modelo).toBe("modelo-x");
  });

  it("exige OPENAI_BASE_URL no provedor compatível", () => {
    expect(() => carregarConfig({ PROVEDOR: "openai_compativel", MODELO: "llama" })).toThrow(/OPENAI_BASE_URL/);
  });

  it("recusa provedor desconhecido", () => {
    expect(() => carregarConfig({ PROVEDOR: "outro" })).toThrow();
  });
});

describe("rotas básicas", () => {
  it("responde a saúde sem expor a chave", async () => {
    const app = await montarApp(carregarConfig({ ANTHROPIC_API_KEY: "sk-teste-segredo" }));
    const r = await app.inject({ method: "GET", url: "/api/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, provedor: "anthropic", modelo: "claude-opus-5-5" });
    expect(r.body).not.toContain("sk-teste-segredo");
  });

  it("lista produtos do .env mais 'Outro'", async () => {
    const app = await montarApp(carregarConfig({ PRODUTOS: "Loja,App" }));
    const r = await app.inject({ method: "GET", url: "/api/opcoes" });
    expect(r.json().produtos).toEqual(["Loja", "App", "Outro"]);
  });

  it("entrega o index.html do web e 404 em JSON para /api desconhecida", async () => {
    const pasta = mkdtempSync(path.join(tmpdir(), "web-"));
    writeFileSync(path.join(pasta, "index.html"), "<h1>Issue Doc Generator</h1>");
    const app = await montarApp(carregarConfig({}), { pastaWeb: pasta });

    const pagina = await app.inject({ method: "GET", url: "/qualquer/rota" });
    expect(pagina.statusCode).toBe(200);
    expect(pagina.body).toContain("Issue Doc Generator");

    const api = await app.inject({ method: "GET", url: "/api/nao-existe" });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ erro: "Rota não encontrada." });
  });
});
