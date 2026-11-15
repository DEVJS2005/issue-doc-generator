import type { Config } from "../config.js";
import { criarProvedorAnthropic } from "./anthropic.js";
import { criarProvedorGemini } from "./gemini.js";
import { criarProvedorOpenAI } from "./openai.js";
import type { Provedor } from "./tipos.js";

/** Provedor escolhido no .env (PROVEDOR + MODELO). null quando falta a chave. */
export function criarProvedor(c: Config): Provedor | null {
  switch (c.provedor) {
    case "anthropic":
      if (!c.anthropicApiKey) return null;
      return criarProvedorAnthropic({
        apiKey: c.anthropicApiKey,
        modelo: c.modelo,
        esforco: c.esforco,
        maxTokens: c.maxTokensSaida,
        fallbackRecusa: c.fallbackRecusa,
      });
    case "openai":
      if (!c.openaiApiKey) return null;
      return criarProvedorOpenAI({ apiKey: c.openaiApiKey, modelo: c.modelo, maxTokens: c.maxTokensSaida });
    case "openai_compativel":
      return criarProvedorOpenAI({
        apiKey: c.openaiApiKey,
        modelo: c.modelo,
        maxTokens: c.maxTokensSaida,
        baseURL: c.openaiBaseUrl,
      });
    case "gemini":
      if (!c.geminiApiKey) return null;
      return criarProvedorGemini({
        apiKey: c.geminiApiKey,
        modelo: c.modelo,
        maxTokens: c.maxTokensSaida,
        esforco: c.esforco,
      });
  }
}
