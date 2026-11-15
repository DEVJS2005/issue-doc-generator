import { describe, expect, it } from "vitest";
import { montarPromptSistema, PASTA_PROMPTS } from "../src/prompt/montar.js";

describe("prompt de sistema", () => {
  const prompt = montarPromptSistema();

  it("junta instruções e base ISTQB, nessa ordem", () => {
    const papel = prompt.indexOf("# Papel");
    const base = prompt.indexOf("# Base de conhecimento ISTQB (CTFL v4.0.1)");
    expect(papel).toBe(0);
    expect(base).toBeGreaterThan(papel);
    expect(prompt).toContain("### 4.2.2 Boundary Value Analysis");
    expect(prompt).toContain("CC BY-NC 4.0");
  });

  it("traz as regras centrais", () => {
    expect(prompt).toContain("[a preencher]");
    expect(prompt).toContain("máximo+1");
    expect(prompt).toContain("perfeitamente");
    expect(prompt).toContain("proibidas");
  });

  it("é idêntico entre chamadas (requisito do cache de prompt)", () => {
    expect(montarPromptSistema()).toBe(prompt);
    expect(prompt).not.toMatch(/\r/);
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
  });

  it("não menciona nenhuma empresa específica", () => {
    expect(prompt.toLowerCase()).not.toMatch(/tecsis|educasis|seller center/);
  });

  it("inclui os 2 exemplos completos depois da base ISTQB, em ordem", () => {
    const base = prompt.indexOf("# Base de conhecimento ISTQB");
    const ex1 = prompt.indexOf('<exemplo numero="1" nome="Integração apenas de pedidos com pagamento aprovado (Backoffice)">');
    const ex2 = prompt.indexOf('<exemplo numero="2" nome="Gestão de Marcas com status e importação CSV">');
    expect(base).toBeGreaterThan(0);
    expect(ex1).toBeGreaterThan(base);
    expect(ex2).toBeGreaterThan(ex1);
    expect(prompt).toContain("<entrada>\n<tipo>Nova funcionalidade</tipo>");
    expect(prompt).toContain('"titulo": "Gestão de Marcas com status e importação CSV"');
  });

  it("monta sem exemplos quando a lista está vazia", () => {
    expect(montarPromptSistema(PASTA_PROMPTS, [])).not.toContain("# Exemplos completos");
  });
});
