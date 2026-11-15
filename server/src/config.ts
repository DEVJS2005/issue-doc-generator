import { z } from "zod";
import type { NomeProvedor } from "./ia/tipos.js";

const lista = (valor: string | undefined) =>
  (valor ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const booleano = (padrao: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(padrao)
    .transform((v) => v === "true");

// Só a Claude tem modelo padrão. Para os outros provedores, MODELO é obrigatório: nomes de
// modelos mudam com frequência e o servidor não deve adivinhar.
const MODELO_PADRAO: Partial<Record<NomeProvedor, string>> = { anthropic: "claude-opus-5-5" };

const esquema = z.object({
  PROVEDOR: z.enum(["anthropic", "openai", "openai_compativel", "gemini"]).default("anthropic"),
  MODELO: z.string().trim().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().trim().default(""),
  GEMINI_API_KEY: z.string().default(""),
  ESFORCO: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  FALLBACK_RECUSA: booleano("true"),
  MAX_TOKENS_SAIDA: z.coerce.number().int().positive().default(64000),
  TEMPO_LIMITE_SEGUNDOS: z.coerce.number().int().positive().default(180),
  LIMITE_POR_HORA: z.coerce.number().int().positive().default(30),
  USUARIOS_PERMITIDOS: z.string().default(""),
  PRODUTOS: z.string().default(""),
  PORTA: z.coerce.number().int().positive().default(3000),
  REGISTRAR_DESCRICAO: booleano("false"),
});

export type Config = {
  provedor: NomeProvedor;
  modelo: string;
  anthropicApiKey: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  geminiApiKey: string;
  esforco: "low" | "medium" | "high" | "xhigh" | "max";
  fallbackRecusa: boolean;
  maxTokensSaida: number;
  tempoLimiteMs: number;
  limitePorHora: number;
  usuariosPermitidos: string[];
  produtos: string[];
  porta: number;
  registrarDescricao: boolean;
};

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = esquema.parse(env);
  const modelo = e.MODELO || MODELO_PADRAO[e.PROVEDOR] || "";
  if (!modelo) {
    throw new Error(`MODELO é obrigatório quando PROVEDOR=${e.PROVEDOR}. Defina o nome do modelo no .env.`);
  }
  if (e.PROVEDOR === "openai_compativel" && !e.OPENAI_BASE_URL) {
    throw new Error("OPENAI_BASE_URL é obrigatório quando PROVEDOR=openai_compativel.");
  }
  return {
    provedor: e.PROVEDOR,
    modelo,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    openaiApiKey: e.OPENAI_API_KEY,
    openaiBaseUrl: e.OPENAI_BASE_URL,
    geminiApiKey: e.GEMINI_API_KEY,
    esforco: e.ESFORCO,
    fallbackRecusa: e.FALLBACK_RECUSA,
    maxTokensSaida: e.MAX_TOKENS_SAIDA,
    tempoLimiteMs: e.TEMPO_LIMITE_SEGUNDOS * 1000,
    limitePorHora: e.LIMITE_POR_HORA,
    usuariosPermitidos: lista(e.USUARIOS_PERMITIDOS),
    produtos: lista(e.PRODUTOS),
    porta: e.PORTA,
    registrarDescricao: e.REGISTRAR_DESCRICAO,
  };
}
