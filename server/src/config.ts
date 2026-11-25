import type { ConfigJira } from "./integracoes/jira.js";
import { isIP } from "node:net";
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

/**
 * Em quem confiar para ler o IP real e o protocolo (X-Forwarded-For e X-Forwarded-Proto). Vai
 * direto para o `trustProxy` do Fastify:
 * - false: em ninguém (o IP é o da conexão);
 * - número de saltos: quantos proxies há na frente (true vale 1, nunca "todos");
 * - lista de IP/CIDR: os endereços dos proxies.
 */
export type ConfiancaProxy = false | number | string[];

function ipOuCidr(item: string) {
  const [ip, mascara, ...resto] = item.split("/");
  const versao = isIP(ip);
  if (!versao || resto.length) return false;
  if (mascara === undefined) return true;
  const bits = Number(mascara);
  return /^\d+$/.test(mascara) && bits >= 0 && bits <= (versao === 4 ? 32 : 128);
}

/** O formato que o `trustProxy` do Fastify aceita. Saltos viram a função equivalente do proxy-addr. */
export function trustProxyDoFastify(c: ConfiancaProxy): boolean | string[] | ((endereco: string, salto: number) => boolean) {
  if (c === false || c === 0) return false;
  if (typeof c === "number") return (_endereco, salto) => salto < c;
  return c;
}

export function lerConfiancaProxy(valor: string): ConfiancaProxy | null {
  const v = valor.trim().toLowerCase();
  if (v === "" || v === "false" || v === "0") return false;
  if (v === "true") return 1;
  if (/^\d+$/.test(v)) return Number(v);
  const itens = lista(v);
  return itens.length && itens.every(ipOuCidr) ? itens : null;
}

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
  // Chave de 32 bytes (64 caracteres hex ou base64) para criptografar os backups. Vazio = backup
  // sem criptografia, como antes.
  BACKUP_CHAVE: z
    .string()
    .default("")
    .transform((v, ctx) => {
      const t = v.trim();
      if (!t) return null;
      const chave = /^[0-9a-f]{64}$/i.test(t) ? Buffer.from(t, "hex") : /^[A-Za-z0-9+/_-]{43}=?$/.test(t) ? Buffer.from(t, "base64") : null;
      if (chave?.length !== 32) {
        ctx.addIssue({ code: "custom", message: "BACKUP_CHAVE: use 32 bytes aleatórios em hex (64 caracteres) ou em base64. Veja o .env.example." });
        return z.NEVER;
      }
      return chave;
    }),
  SESSAO_HORAS: z.coerce.number().positive().default(12),
  // Endereço público do sistema (ex.: https://issues.empresa.com). A chave de acesso (passkey) fica
  // presa a esse domínio; vazio = chave de acesso desligada.
  URL_PUBLICA: z
    .string()
    .default("")
    .transform((v, ctx) => {
      const t = v.trim().replace(/\/+$/, "");
      if (!t) return null;
      let url: URL;
      try {
        url = new URL(t);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "URL_PUBLICA: use o endereço completo, ex.: https://issues.empresa.com",
        });
        return z.NEVER;
      }
      const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.startsWith("[");
      if (!["http:", "https:"].includes(url.protocol) || ip || (url.protocol === "http:" && url.hostname !== "localhost")) {
        ctx.addIssue({
          code: "custom",
          message: "URL_PUBLICA: use https com um nome de domínio (http só com localhost; IP não serve para chave de acesso).",
        });
        return z.NEVER;
      }
      return { origem: url.origin, dominio: url.hostname };
    }),
  // Admin precisa de verificação em duas etapas (aplicativo autenticador ou chave de acesso).
  ADMIN_EXIGE_MFA: booleano("false"),
  CONFIAR_PROXY: z
    .string()
    .default("false")
    .transform((v, ctx) => {
      const confianca = lerConfiancaProxy(v);
      if (confianca === null) {
        ctx.addIssue({ code: "custom", message: "CONFIAR_PROXY: use false, true, o número de proxies ou a lista de IP/CIDR dos proxies." });
        return z.NEVER;
      }
      return confianca;
    }),
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
  // Chaves dos projetos em que se pode criar issues, separadas por vírgula; "*" libera todos.
  // Vazio: nenhum (o envio fica bloqueado e o servidor avisa no log).
  JIRA_PROJETOS: z.string().default(""),
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
  /** Projetos do Jira liberados: "*" (todos) ou as chaves, em maiúsculas. Lista vazia: nenhum. */
  jiraProjetos: "*" | string[];
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
  /** Chave AES-256 dos backups; null = backup sem criptografia. */
  backupChave: Buffer | null;
  sessaoHoras: number;
  /** Endereço público: origem e domínio da chave de acesso (null = desligada). */
  urlPublica: { origem: string; dominio: string } | null;
  /** Admin só usa o sistema depois de ligar o MFA. */
  adminExigeMfa: boolean;
  confiarProxy: ConfiancaProxy;
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
    jiraProjetos: e.JIRA_PROJETOS.trim() === "*" ? "*" : lista(e.JIRA_PROJETOS).map((c) => c.toUpperCase()),
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
    backupChave: e.BACKUP_CHAVE,
    sessaoHoras: e.SESSAO_HORAS,
    adminExigeMfa: e.ADMIN_EXIGE_MFA,
    urlPublica: e.URL_PUBLICA,
    confiarProxy: e.CONFIAR_PROXY,
    precoPorMtok: lerPreco(e.PRECO_POR_MTOK),
  };
}
