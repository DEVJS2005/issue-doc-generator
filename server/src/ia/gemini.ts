import { FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ErroGeracao, normalizarErro } from "./erros.js";
import { schemaParaProvedor } from "./json.js";
import type { Provedor, Uso } from "./tipos.js";

type Esforco = "low" | "medium" | "high" | "xhigh" | "max";
type OpcoesGemini = { apiKey: string; modelo: string; maxTokens: number; esforco: Esforco };

// ESFORCO vira o nível de raciocínio do Gemini (o Gemini não tem xhigh/max: usam HIGH).
const NIVEL: Record<Esforco, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
  xhigh: ThinkingLevel.HIGH,
  max: ThinkingLevel.HIGH,
};

const RECUSAS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

// Saída estruturada por responseJsonSchema. O cache do Gemini é implícito: prefixos repetidos
// (o prompt de sistema fixo) aparecem em cachedContentTokenCount.
export function criarProvedorGemini(o: OpcoesGemini): Provedor {
  // Como nos outros SDKs (maxRetries: 2): até 3 tentativas em 408, 429 e 5xx, com espera crescente.
  const ai = new GoogleGenAI({ apiKey: o.apiKey, httpOptions: { retryOptions: { attempts: 3 } } });
  const schema = schemaParaProvedor();

  return {
    nome: "gemini",
    modelo: o.modelo,
    async gerar({ sistema, usuario }, { signal, aoProgresso }) {
      try {
        const stream = await ai.models.generateContentStream({
          model: o.modelo,
          contents: usuario,
          config: {
            systemInstruction: sistema,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            maxOutputTokens: o.maxTokens,
            // includeThoughts faz o raciocínio vir no stream: a tela mostra progresso enquanto o
            // modelo pensa, em vez de ficar parada até o primeiro trecho de JSON.
            thinkingConfig: { thinkingLevel: NIVEL[o.esforco], includeThoughts: true },
            abortSignal: signal,
          },
        });
        let texto = "";
        let motivoFim: string | undefined;
        let bloqueio: string | undefined;
        let uso: Uso = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };
        let modelo = o.modelo;

        for await (const pedaco of stream) {
          if (pedaco.modelVersion) modelo = pedaco.modelVersion;
          // Pensamentos não entram no JSON: só sinalizam progresso.
          for (const parte of pedaco.candidates?.[0]?.content?.parts ?? []) {
            if (parte.thought) {
              aoProgresso({ fase: "analisando" });
            } else if (parte.text) {
              texto += parte.text;
              aoProgresso({ fase: "escrevendo", delta: parte.text });
            }
          }
          motivoFim = pedaco.candidates?.[0]?.finishReason ?? motivoFim;
          bloqueio = pedaco.promptFeedback?.blockReason ?? bloqueio;
          const m = pedaco.usageMetadata;
          if (m) {
            const cache = m.cachedContentTokenCount ?? 0;
            uso = {
              entrada: (m.promptTokenCount ?? 0) - cache,
              saida: (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0),
              cacheLeitura: cache,
              cacheEscrita: 0,
            };
          }
        }

        if (bloqueio || (motivoFim && RECUSAS.has(motivoFim))) {
          throw new ErroGeracao("recusa", bloqueio ?? motivoFim);
        }
        if (motivoFim === FinishReason.MAX_TOKENS) throw new ErroGeracao("max_tokens");
        return { texto, uso, modelo, usouFallback: false };
      } catch (erro) {
        throw normalizarErro(erro, signal);
      }
    },
  };
}
