import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { Config } from "../config.js";
import { ErroGeracao, normalizarErro } from "./erros.js";
import { VERSAO_API_GEMINI } from "./gemini.js";
import type { NomeProvedor } from "./tipos.js";

const LIMITE = 300;

/** Modelos que a chave configurada pode usar, direto da API do provedor (para a administração). */
export async function listarModelos(c: Config, provedor: NomeProvedor): Promise<string[]> {
  const ids: string[] = [];
  try {
    switch (provedor) {
      case "anthropic": {
        if (!c.anthropicApiKey) throw new ErroGeracao("nao_configurado");
        const cliente = new Anthropic({ apiKey: c.anthropicApiKey, maxRetries: 1, timeout: 15_000 });
        for await (const m of cliente.models.list()) {
          ids.push(m.id);
          if (ids.length >= LIMITE) break;
        }
        break;
      }
      case "openai":
      case "openai_compativel": {
        const compativel = provedor === "openai_compativel";
        if (compativel ? !c.openaiBaseUrl : !c.openaiApiKey) throw new ErroGeracao("nao_configurado");
        const cliente = new OpenAI({
          apiKey: c.openaiApiKey || "sem-chave",
          baseURL: compativel ? c.openaiBaseUrl : undefined,
          maxRetries: 1,
          timeout: 15_000,
        });
        for await (const m of cliente.models.list()) {
          ids.push(m.id);
          if (ids.length >= LIMITE) break;
        }
        break;
      }
      case "gemini": {
        if (!c.geminiApiKey) throw new ErroGeracao("nao_configurado");
        const ai = new GoogleGenAI({ apiKey: c.geminiApiKey, apiVersion: VERSAO_API_GEMINI });
        for await (const m of await ai.models.list()) {
          if (m.name && (m.supportedActions ?? []).includes("generateContent")) ids.push(m.name.replace(/^models\//, ""));
          if (ids.length >= LIMITE) break;
        }
        break;
      }
    }
  } catch (erro) {
    throw normalizarErro(erro);
  }
  return [...new Set(ids)].sort();
}
