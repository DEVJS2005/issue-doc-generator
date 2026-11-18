// Cliente mínimo do Jira (REST API v2, que existe no Jira Cloud e no Data Center).
// Cloud: JIRA_EMAIL + JIRA_TOKEN (token de API, autenticação Basic).
// Data Center: só JIRA_TOKEN (token de acesso pessoal, autenticação Bearer).

export type ConfigJira = { url: string; email: string; token: string };
export type ProjetoJira = { chave: string; nome: string };
export type TipoJira = { id: string; nome: string };
export type IssueCriada = { chave: string; url: string };

export class ErroJira extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = "ErroJira";
  }
}

const TEMPO_LIMITE_MS = 15_000;
const MAX_RESUMO = 255;

/** Junta as mensagens de erro do Jira ({ errorMessages: [...], errors: { campo: msg } }). */
function mensagensDoJira(corpo: unknown): string {
  const c = corpo as { errorMessages?: string[]; errors?: Record<string, string> } | null;
  const partes = [...(c?.errorMessages ?? []), ...Object.entries(c?.errors ?? {}).map(([campo, msg]) => `${campo}: ${msg}`)];
  return partes.join(" ").slice(0, 300);
}

export function criarClienteJira(c: ConfigJira, buscar: typeof fetch = fetch) {
  const base = c.url.replace(/\/+$/, "");
  const autorizacao = c.email ? `Basic ${Buffer.from(`${c.email}:${c.token}`).toString("base64")}` : `Bearer ${c.token}`;

  async function pedir<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<T> {
    let r: Response;
    try {
      r = await buscar(`${base}${caminho}`, {
        method: metodo,
        headers: { authorization: autorizacao, accept: "application/json", ...(corpo ? { "content-type": "application/json" } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch {
      throw new ErroJira("Não foi possível falar com o Jira. Confira JIRA_URL e a rede do servidor.", 502);
    }
    const dados = await r.json().catch(() => null);
    if (r.ok) return dados as T;
    if (r.status === 401) throw new ErroJira("O Jira recusou as credenciais. Confira JIRA_EMAIL e JIRA_TOKEN no .env.", 502);
    if (r.status === 403) throw new ErroJira("A conta do Jira não tem permissão para isso neste projeto.", 403);
    if (r.status === 404) throw new ErroJira(mensagensDoJira(dados) || "Projeto ou tipo de issue não encontrado no Jira.", 404);
    if (r.status === 429) throw new ErroJira("O Jira pediu para esperar (limite de requisições). Tente de novo em instantes.", 429);
    throw new ErroJira(mensagensDoJira(dados) ? `O Jira recusou: ${mensagensDoJira(dados)}` : `O Jira respondeu com erro ${r.status}.`, r.status >= 500 ? 502 : 400);
  }

  return {
    url: base,

    async projetos(): Promise<ProjetoJira[]> {
      const lista = await pedir<{ key: string; name: string }[]>("GET", "/rest/api/2/project");
      return lista.map((p) => ({ chave: p.key, nome: p.name })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },

    async tipos(projeto: string): Promise<TipoJira[]> {
      const r = await pedir<{ values?: { id: string; name: string; subtask?: boolean }[] }>(
        "GET",
        `/rest/api/2/issue/createmeta/${encodeURIComponent(projeto)}/issuetypes`,
      );
      return (r.values ?? []).filter((t) => !t.subtask).map((t) => ({ id: t.id, nome: t.name }));
    },

    async criar(o: { projeto: string; tipoId: string; resumo: string; descricao: string; rotulos: string[] }): Promise<IssueCriada> {
      const resumo = o.resumo.replace(/\s+/g, " ").trim();
      const r = await pedir<{ key: string }>("POST", "/rest/api/2/issue", {
        fields: {
          project: { key: o.projeto },
          issuetype: { id: o.tipoId },
          summary: resumo.length > MAX_RESUMO ? `${resumo.slice(0, MAX_RESUMO - 1)}…` : resumo,
          description: o.descricao,
          labels: o.rotulos,
        },
      });
      return { chave: r.key, url: `${base}/browse/${r.key}` };
    },
  };
}

export type ClienteJira = ReturnType<typeof criarClienteJira>;
