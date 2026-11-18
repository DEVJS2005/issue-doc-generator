import type { ConfigJira } from "./integracoes/jira.js";
import path from "node:path";
import { z } from "zod";
import type { ConfigOidc } from "./auth/oidc.js";
import { lerPreco, type Preco } from "./custo.js";
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
  // 300 s: modelos que raciocinam bastante levaram até ~260 s em entradas longas e no Refinar.
  TEMPO_LIMITE_SEGUNDOS: z.coerce.number().int().positive().default(300),
  LIMITE_POR_HORA: z.coerce.number().int().positive().default(30),
  USUARIOS_PERMITIDOS: z.string().default(""),
  PORTA: z.coerce.number().int().positive().default(3000),
  REGISTRAR_DESCRICAO: booleano("false"),
  SEGREDO_SESSAO: z.string().default(""),
  SESSAO_HORAS: z.coerce.number().positive().default(12),
  CONFIAR_PROXY: booleano("false"),
  PRECO_POR_MTOK: z.string().trim().default(""),
  // Login único (OpenID Connect). Desligado enquanto OIDC_EMISSOR estiver vazio.
  OIDC_EMISSOR: z.string().trim().default(""),
  OIDC_CLIENTE_ID: z.string().trim().default(""),
  OIDC_CLIENTE_SEGREDO: z.string().default(""),
  OIDC_URL_RETORNO: z.string().trim().default(""),
  OIDC_ROTULO: z.string().trim().default("Entrar com SSO"),
  OIDC_DOMINIOS_AUTOCADASTRO: z.string().default(""),
  // Jira (criar a issue direto lá). Desligado enquanto JIRA_URL ou JIRA_TOKEN estiver vazio.
  // Cloud: JIRA_EMAIL + token de API. Data Center: só o token de acesso pessoal (JIRA_EMAIL vazio).
  JIRA_URL: z.string().trim().default(""),
  JIRA_EMAIL: z.string().trim().default(""),
  JIRA_TOKEN: z.string().default(""),
  // Nos testes (NODE_ENV=test) o banco é em memória; fora deles, data/ na pasta onde o servidor roda.
  ARQUIVO_BANCO: z
    .string()
    .trim()
    .default(process.env.NODE_ENV === "test" ? ":memory:" : path.join(process.cwd(), "data", "issue-doc-generator.db")),
});

export type Config = {
  arquivoBanco: string;
  oidc: ConfigOidc | null;
  jira: ConfigJira | null;
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
  porta: number;
  registrarDescricao: boolean;
  segredoSessao: string;
  sessaoHoras: number;
  confiarProxy: boolean;
  precoPorMtok: Preco | null;
};

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = esquema.parse(env);
  // PROVEDOR, MODELO, ESFORCO, LIMITE_POR_HORA e TEMPO_LIMITE_SEGUNDOS são só o ponto de partida:
  // a tela de administração muda esses valores e os grava no banco. Sem modelo, a geração
  // responde "não configurado" e a administração pede o nome.
  const modelo = e.MODELO || MODELO_PADRAO[e.PROVEDOR] || "";
  const oidc: ConfigOidc | null = e.OIDC_EMISSOR
    ? {
        emissor: e.OIDC_EMISSOR,
        clienteId: e.OIDC_CLIENTE_ID,
        clienteSegredo: e.OIDC_CLIENTE_SEGREDO,
        urlRetorno: e.OIDC_URL_RETORNO || `http://localhost:${e.PORTA}/api/sso/retorno`,
        rotulo: e.OIDC_ROTULO,
        dominiosAutoCadastro: lista(e.OIDC_DOMINIOS_AUTOCADASTRO).map((d) => d.toLowerCase().replace(/^@/, "")),
      }
    : null;
  return {
    arquivoBanco: e.ARQUIVO_BANCO,
    oidc,
    jira: e.JIRA_URL && e.JIRA_TOKEN ? { url: e.JIRA_URL, email: e.JIRA_EMAIL, token: e.JIRA_TOKEN } : null,
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
    porta: e.PORTA,
    registrarDescricao: e.REGISTRAR_DESCRICAO,
    segredoSessao: e.SEGREDO_SESSAO,
    sessaoHoras: e.SESSAO_HORAS,
    confiarProxy: e.CONFIAR_PROXY,
    precoPorMtok: lerPreco(e.PRECO_POR_MTOK),
  };
}
