import { afterEach, describe, expect, it, vi } from "vitest";
import { configRaciocinio, criarProvedorGemini, VERSAO_API_GEMINI } from "../src/ia/gemini.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Gemini", () => {
  // Regressão: o @google/genai 3.x mudou o padrão para "v1", e a geração passou a falhar com
  // "Developer instruction is not enabled for api version v1".
  it("chama a API v1beta, que aceita instrução de sistema e saída por schema", async () => {
    const pedidos: { url: string; corpo: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        pedidos.push({ url: String(url instanceof Request ? url.url : url), corpo: String(init?.body ?? "") });
        return new Response(JSON.stringify({ error: { code: 400, message: "parar aqui", status: "INVALID_ARGUMENT" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const provedor = criarProvedorGemini({ apiKey: "chave-de-teste", modelo: "gemini-teste", maxTokens: 1000, esforco: "low" });
    await expect(provedor.gerar({ sistema: "INSTRUCAO-DE-SISTEMA", usuario: "descrição" }, { signal: new AbortController().signal, aoProgresso: () => {} })).rejects.toThrow();

    expect(VERSAO_API_GEMINI).toBe("v1beta");
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos[0].url).toContain("/v1beta/models/gemini-teste:streamGenerateContent");
    expect(pedidos[0].corpo).toContain("INSTRUCAO-DE-SISTEMA");
  });

  // Regressão: o Gemini 2.5 recusa thinkingLevel ("Thinking level is not supported for this model").
  it("Gemini 2.x usa orçamento de raciocínio; Gemini 3 em diante usa nível", () => {
    expect(configRaciocinio("gemini-2.5-flash", "low")).toEqual({ thinkingBudget: 1024, includeThoughts: true });
    expect(configRaciocinio("gemini-2.5-pro", "max")).toEqual({ thinkingBudget: -1, includeThoughts: true });
    expect(configRaciocinio("gemini-3-flash-preview", "low")).toMatchObject({ thinkingLevel: expect.any(String), includeThoughts: true });
    expect(configRaciocinio("gemini-3-flash-preview", "low")).not.toHaveProperty("thinkingBudget");
  });
});
