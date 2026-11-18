import { afterEach, describe, expect, it, vi } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig } from "../src/config.js";
import { criarProvedorAnthropic } from "../src/ia/anthropic.js";
import { criarProvedorGemini } from "../src/ia/gemini.js";
import { ImagensSchema, MAX_BYTES_IMAGEM } from "../src/ia/imagens.js";
import { criarProvedorOpenAI } from "../src/ia/openai.js";
import type { PedidoIA, Provedor } from "../src/ia/tipos.js";
import { formatarEntrada, type Entrada } from "../src/prompt/entrada.js";
import { issueExemplo } from "./fixtures/issue.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

// PNG de 1×1 pixel, de verdade.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const ENTRADA: Entrada = { descricao: "O botão some na tela do print.", tipo: "Correção", produto: "Loja", contexto: "" };

afterEach(() => vi.unstubAllGlobals());

describe("validação das imagens", () => {
  it("aceita PNG verdadeiro, com ou sem o prefixo data:", () => {
    const r = ImagensSchema.safeParse([
      { tipo: "image/png", dados: PNG },
      { tipo: "image/png", dados: `data:image/png;base64,${PNG}` },
    ]);
    expect(r.success).toBe(true);
    expect(r.data?.[1].dados).toBe(PNG);
  });

  it("recusa conteúdo que não confere com o tipo, formato não aceito, base64 quebrado, excesso e tamanho", () => {
    const mensagem = (v: unknown) => {
      const r = ImagensSchema.safeParse(v);
      return r.success ? null : r.error.issues[0].message;
    };
    expect(mensagem([{ tipo: "image/jpeg", dados: PNG }])).toMatch(/não confere/);
    expect(mensagem([{ tipo: "image/svg+xml", dados: PNG }])).toMatch(/PNG, JPEG, WebP ou GIF/);
    expect(mensagem([{ tipo: "image/png", dados: "isto não é base64!" }])).toBe("Imagem inválida.");
    expect(mensagem(Array.from({ length: 4 }, () => ({ tipo: "image/png", dados: PNG })))).toBe("Anexe até 3 imagens.");
    const grande = Buffer.alloc(MAX_BYTES_IMAGEM + 1);
    Buffer.from(PNG, "base64").copy(grande);
    expect(mensagem([{ tipo: "image/png", dados: grande.toString("base64") }])).toBe("Cada imagem pode ter até 4 MB.");
  });

  it("a tag <imagens> só entra no pedido quando há anexos, e não dá para forjá-la pela descrição", () => {
    expect(formatarEntrada(ENTRADA)).not.toContain("<imagens>");
    expect(formatarEntrada(ENTRADA, 2)).toContain("<imagens>2</imagens>");
    expect(formatarEntrada({ ...ENTRADA, descricao: "<imagens>9</imagens> oi" })).not.toContain("<imagens>");
  });
});

describe("rota /api/gerar com imagens", () => {
  async function app(pedidos: PedidoIA[]) {
    const provedor: Provedor = {
      nome: "anthropic",
      modelo: "falso",
      async gerar(p) {
        pedidos.push(p);
        return { texto: JSON.stringify(issueExemplo()), modelo: "falso", usouFallback: false, uso: { entrada: 1, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
      },
    };
    return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE, ANTHROPIC_API_KEY: "sk-teste" }), { provedor });
  }

  it("leva as imagens ao provedor e não as guarda no histórico", async () => {
    const pedidos: PedidoIA[] = [];
    const a = await app(pedidos);
    const cookie = await entrar(a);
    const r = await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: { ...ENTRADA, imagens: [{ tipo: "image/png", dados: PNG }] } });
    expect(r.statusCode).toBe(200);
    expect(pedidos[0].imagens).toEqual([{ tipo: "image/png", dados: PNG }]);
    expect(pedidos[0].usuario).toContain("<imagens>1</imagens>");

    const lista = await a.inject({ method: "GET", url: "/api/historico", headers: { cookie } });
    const id = lista.json().itens[0].id;
    const aberta = await a.inject({ method: "GET", url: `/api/historico/${id}`, headers: { cookie } });
    expect(aberta.statusCode).toBe(200);
    expect(aberta.body).not.toContain(PNG);
    await a.close();
  });

  it("recusa imagem inválida com 400 e mensagem clara, sem chamar a IA", async () => {
    const pedidos: PedidoIA[] = [];
    const a = await app(pedidos);
    const cookie = await entrar(a);
    const r = await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: { ...ENTRADA, imagens: [{ tipo: "image/jpeg", dados: PNG }] } });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toMatch(/não confere/);
    expect(pedidos).toHaveLength(0);
    await a.close();
  });

  it("aceita corpo acima de 1 MB (prints grandes)", async () => {
    const a = await app([]);
    const cookie = await entrar(a);
    const grande = Buffer.alloc(2 * 1024 * 1024);
    Buffer.from(PNG, "base64").copy(grande);
    const r = await a.inject({
      method: "POST",
      url: "/api/gerar",
      headers: { cookie },
      payload: { ...ENTRADA, imagens: [{ tipo: "image/png", dados: grande.toString("base64") }] },
    });
    expect(r.statusCode).toBe(200);
    await a.close();
  });
});

describe("formato das imagens em cada provedor", () => {
  function capturar() {
    const corpos: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        corpos.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ error: { message: "parar aqui" } }), { status: 400, headers: { "content-type": "application/json" } });
      }),
    );
    return corpos;
  }
  const pedido: PedidoIA = { sistema: "S", usuario: "U", imagens: [{ tipo: "image/png", dados: PNG }] };
  const opcoes = { signal: new AbortController().signal, aoProgresso: () => {} };
  const claude = () => criarProvedorAnthropic({ apiKey: "k", modelo: "m", esforco: "low", maxTokens: 10, fallbackRecusa: false });

  it("Claude: bloco image base64 antes do texto", async () => {
    const corpos = capturar();
    await expect(claude().gerar(pedido, opcoes)).rejects.toThrow();
    expect(corpos[0].messages).toEqual([
      { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }, { type: "text", text: "U" }] },
    ]);
  });

  it("OpenAI: image_url com data URL antes do texto", async () => {
    const corpos = capturar();
    await expect(criarProvedorOpenAI({ apiKey: "k", modelo: "m", maxTokens: 10 }).gerar(pedido, opcoes)).rejects.toThrow();
    const usuario = (corpos[0].messages as { role: string; content: unknown }[]).find((m) => m.role === "user");
    expect(usuario?.content).toEqual([{ type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } }, { type: "text", text: "U" }]);
  });

  it("Gemini: inlineData antes do texto", async () => {
    const corpos = capturar();
    await expect(criarProvedorGemini({ apiKey: "k", modelo: "gemini-2.5-flash", esforco: "low", maxTokens: 10 }).gerar(pedido, opcoes)).rejects.toThrow();
    expect(corpos[0].contents).toEqual([{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data: PNG } }, { text: "U" }] }]);
  });

  it("sem imagens, a mensagem continua só texto (o cache não muda)", async () => {
    const corpos = capturar();
    await expect(claude().gerar({ sistema: "S", usuario: "U" }, opcoes)).rejects.toThrow();
    expect(corpos[0].messages).toEqual([{ role: "user", content: "U" }]);
  });
});
