import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig } from "../src/config.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

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
    const c = carregarConfig({ USUARIOS_PERMITIDOS: " a@x.dev:1, b@x.dev:2 ," });
    expect(c.usuariosPermitidos).toEqual(["a@x.dev:1", "b@x.dev:2"]);
  });

  it("recusa esforço inválido", () => {
    expect(() => carregarConfig({ ESFORCO: "turbo" })).toThrow();
  });

  it("só a Claude tem modelo padrão; nos outros o modelo fica vazio até a administração definir", () => {
    expect(carregarConfig({ PROVEDOR: "openai" }).modelo).toBe("");
    expect(carregarConfig({ PROVEDOR: "gemini" }).modelo).toBe("");
    expect(carregarConfig({ PROVEDOR: "openai", MODELO: "modelo-x" }).modelo).toBe("modelo-x");
  });

  it("usa banco em memória nos testes", () => {
    expect(carregarConfig({}).arquivoBanco).toBe(":memory:");
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

  it("as opções trazem tipos e limites, sem lista de produtos", async () => {
    const app = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE }));
    const r = await app.inject({ method: "GET", url: "/api/opcoes", headers: { cookie: await entrar(app) } });
    expect(r.json()).toEqual({
      tipos: ["Correção", "Nova funcionalidade", "Ajuste técnico", "Melhoria"],
      limites: { descricao: 4000, contexto: 8000, ajuste: 2000 },
    });
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
