import { afterEach, describe, expect, it, vi } from "vitest";
import { criarProvedorAnthropic } from "../src/ia/anthropic.js";
import { criarProvedorGemini } from "../src/ia/gemini.js";
import { criarProvedorOpenAI } from "../src/ia/openai.js";
import type { PedidoIA, Provedor } from "../src/ia/tipos.js";

afterEach(() => vi.unstubAllGlobals());

/** Captura o corpo que o SDK manda e para logo na 1ª chamada (a API "responde" 400). */
async function corpoEnviado(criar: () => Provedor, pedido: PedidoIA) {
  const corpos: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      corpos.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ error: { code: 400, message: "parar aqui", type: "invalid_request_error" } }), { status: 400, headers: { "content-type": "application/json" } });
    }),
  );
  await expect(criar().gerar(pedido, { signal: new AbortController().signal, aoProgresso: () => {} })).rejects.toThrow();
  return corpos[0];
}

const CONTEXTO = "<contexto_do_sistema>\n- Painel Loja Exemplo\n</contexto_do_sistema>";
const chave = "chave-de-teste";

describe("provedores: bloco do Meu contexto e resposta em texto livre", () => {
  it("Anthropic: o contexto vem num 2º bloco de sistema, também com cache; em texto, sem o formato da issue", async () => {
    const p = () =>
      criarProvedorAnthropic({ apiKey: chave, modelo: "claude-teste", esforco: "low", maxTokens: 1000, fallbackRecusa: false });
    const comContexto = await corpoEnviado(p, { sistema: "FIXO", usuario: "u", contextoSistema: CONTEXTO });
    expect(comContexto.system).toEqual([
      { type: "text", text: "FIXO", cache_control: { type: "ephemeral" } },
      { type: "text", text: CONTEXTO, cache_control: { type: "ephemeral" } },
    ]);
    expect(comContexto.output_config).toHaveProperty("format");
    const semContexto = await corpoEnviado(p, { sistema: "FIXO", usuario: "u" });
    expect(semContexto.system).toHaveLength(1);
    const texto = await corpoEnviado(p, { sistema: "FIXO", usuario: "u", formato: "texto" });
    expect(texto.output_config).toEqual({ effort: "low" });
  });

  it("OpenAI: o contexto vem numa 2ª mensagem de sistema, depois da fixa; em texto, sem response_format", async () => {
    const p = () => criarProvedorOpenAI({ apiKey: chave, modelo: "gpt-teste", maxTokens: 1000 });
    const comContexto = await corpoEnviado(p, { sistema: "FIXO", usuario: "u", contextoSistema: CONTEXTO });
    expect((comContexto.messages as unknown[]).slice(0, 2)).toEqual([
      { role: "system", content: "FIXO" },
      { role: "system", content: CONTEXTO },
    ]);
    expect(comContexto).toHaveProperty("response_format");
    expect(await corpoEnviado(p, { sistema: "FIXO", usuario: "u", formato: "texto" })).not.toHaveProperty("response_format");
  });

  it("Gemini: o contexto vai no fim da instrução de sistema; em texto, sem o schema", async () => {
    const p = () => criarProvedorGemini({ apiKey: chave, modelo: "gemini-teste", maxTokens: 1000, esforco: "low" });
    const comContexto = await corpoEnviado(p, { sistema: "FIXO", usuario: "u", contextoSistema: CONTEXTO });
    expect(JSON.stringify(comContexto.systemInstruction)).toContain(JSON.stringify(`FIXO\n${CONTEXTO}`).slice(1, -1));
    expect(comContexto.generationConfig).toHaveProperty("responseJsonSchema");
    const texto = await corpoEnviado(p, { sistema: "FIXO", usuario: "u", formato: "texto" });
    expect(texto.generationConfig).not.toHaveProperty("responseJsonSchema");
    expect(texto.generationConfig).not.toHaveProperty("responseMimeType");
  });
});
