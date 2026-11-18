// Cliente da API. A chave da IA nunca passa por aqui: o navegador só fala com o nosso servidor,
// que guarda a sessão num cookie HttpOnly.

export type ErroTela = { codigo: string; mensagem: string; podeTentarDeNovo: boolean };

export class ErroApi extends Error {
  constructor(
    readonly erro: ErroTela,
    readonly status: number,
  ) {
    super(erro.mensagem);
  }
}

export type Usuario = { email: string; nome: string; admin: boolean };
export type Opcoes = {
  tipos: string[];
  limites: { descricao: number; contexto: number; ajuste: number };
};
export type Idioma = "pt-BR" | "en" | "es";
export const IDIOMAS: { valor: Idioma; rotulo: string }[] = [
  { valor: "pt-BR", rotulo: "Português" },
  { valor: "en", rotulo: "Inglês" },
  { valor: "es", rotulo: "Espanhol" },
];
export type Entrada = { descricao: string; tipo: string; produto: string; contexto: string; idioma?: Idioma };

export type StatusIssue = "rascunho" | "revisada" | "aprovada";
export const STATUS: { valor: StatusIssue; rotulo: string }[] = [
  { valor: "rascunho", rotulo: "Rascunho" },
  { valor: "revisada", rotulo: "Revisada" },
  { valor: "aprovada", rotulo: "Aprovada" },
];
export const rotuloStatus = (s: StatusIssue) => STATUS.find((x) => x.valor === s)?.rotulo ?? s;
export type MudancaStatus = { de: StatusIssue; para: StatusIssue; quem: string; quando: number };
export type LinkCompartilhado = { id: number; criadoPor: string; criadoEm: number; expiraEm: number };
export type IssuePublica = {
  titulo: string;
  produto: string;
  tipo: string;
  status: StatusIssue;
  versoes: number;
  atualizadaEm: number;
  autor: string;
  markdown: string;
};
export type InfoBackup = { nome: string; bytes: number; criadoEm: number };
export type ProjetoJira = { chave: string; nome: string };
export type TipoJira = { id: string; nome: string };
export type EnvioJira = { chave: string; url: string; enviadoPor: string; enviadoEm: number };
export type AcaoAuditoria =
  | "login"
  | "login_falhou"
  | "primeiro_admin"
  | "gerar"
  | "refinar"
  | "status"
  | "apagar_issue"
  | "criar_link"
  | "revogar_link"
  | "ajustes"
  | "criar_usuario"
  | "alterar_usuario"
  | "backup"
  | "baixar_backup"
  | "criar_jira";
export type EventoAuditoria = {
  id: number;
  quando: number;
  quem: string;
  acao: AcaoAuditoria;
  alvo: string | null;
  detalhe: Record<string, unknown> | null;
  ip: string | null;
};
export type FiltroAuditoria = { quem?: string; acao?: AcaoAuditoria; de?: number; ate?: number; antesDe?: number };
export type Progresso = { fase: "analisando" | "escrevendo"; caracteres: number; secao: string | null };
export type Resultado = {
  issue: unknown;
  markdown: string;
  avisos: { codigo: string; mensagem: string }[];
  alteracoes: string[] | null;
  modelo: string;
  usouFallback: boolean;
  duracaoMs: number;
  historicoId: number | null;
};

export type ResumoIssue = {
  id: number;
  status: StatusIssue;
  usuario: string;
  /** Nome de usuário do autor (na listagem e na issue aberta). */
  autor?: string;
  titulo: string;
  tipo: string;
  produto: string;
  criadaEm: number;
  atualizadaEm: number;
  versoes: number;
  modelo: string;
};
export type IssueGuardada = ResumoIssue & { entrada: Entrada; issue: unknown; markdown: string };

/** Busca no histórico. Datas no formato do <input type="date"> (AAAA-MM-DD), no fuso de quem busca. */
export type BuscaHistorico = {
  todos: boolean;
  usuario?: string;
  texto?: string;
  produto?: string;
  tipo?: string;
  status?: string;
  de?: string;
  ate?: string;
};

/** Monta a query da busca só com os filtros preenchidos; o período cobre os dias inteiros. */
export function paramsHistorico(b: BuscaHistorico): string {
  const p = new URLSearchParams();
  if (b.todos) p.set("todos", "1");
  const texto = (v?: string) => v?.trim() ?? "";
  if (b.todos && texto(b.usuario)) p.set("usuario", texto(b.usuario));
  for (const k of ["texto", "produto", "tipo", "status"] as const) if (texto(b[k])) p.set(k, texto(b[k]));
  if (b.de) p.set("de", String(new Date(`${b.de}T00:00:00`).getTime()));
  if (b.ate) p.set("ate", String(new Date(`${b.ate}T23:59:59.999`).getTime()));
  return p.toString();
}
export type Versao = { numero: number; quando: number; ajuste: string | null; modelo: string };

export type NomeProvedor = "anthropic" | "openai" | "openai_compativel" | "gemini";
export type ValoresAjustes = {
  provedor: NomeProvedor;
  modelo: string;
  modeloReserva: string;
  esforco: "low" | "medium" | "high" | "xhigh" | "max";
  limitePorHora: number;
  tempoLimiteSegundos: number;
  retencaoDias: number;
  backupCopias: number;
};
export type InfoProvedor = { nome: NomeProvedor; rotulo: string; disponivel: boolean; motivo: string | null; modeloPadrao: string };
export type Alteracao = { quando: number; quem: string; chave: string; de: unknown; para: unknown };
export type EstadoAdmin = { valores: ValoresAjustes; provedores: InfoProvedor[]; alteracoes: Alteracao[] };
export type UsuarioAdmin = { id: number; nome: string; email: string; admin: boolean; ativo: boolean; criadoEm: number; atualizadoEm: number };

const ERRO_GENERICO: ErroTela = { codigo: "desconhecido", mensagem: "Algo deu errado. Tente de novo.", podeTentarDeNovo: true };

async function lerJson<T>(r: Response): Promise<T> {
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new ErroApi(corpo?.erro?.mensagem ? corpo.erro : ERRO_GENERICO, r.status);
  return corpo as T;
}

function postar(url: string, corpo: unknown, signal?: AbortSignal) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal,
  });
}

function chamar<T>(metodo: "GET" | "PUT" | "PATCH" | "DELETE", url: string, corpo?: unknown) {
  return fetch(url, {
    method: metodo,
    headers: corpo === undefined ? undefined : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).then((r) => lerJson<T>(r));
}

/**
 * Sessão: o 401 diz se o banco ainda não tem usuário (`precisaConfigurar`) e qual é o botão de
 * login único, se houver (`sso`).
 */
export async function lerSessao(): Promise<{ usuario: Usuario | null; precisaConfigurar: boolean; sso: string | null }> {
  const r = await fetch("/api/sessao");
  const corpo = await r.json().catch(() => ({}));
  return r.ok
    ? { usuario: corpo.usuario, precisaConfigurar: false, sso: null }
    : { usuario: null, precisaConfigurar: Boolean(corpo.precisaConfigurar), sso: corpo.sso ?? null };
}

export const api = {
  /** `usuario` é o nome de usuário ou o e-mail. */
  entrar: (usuario: string, senha: string) => postar("/api/login", { usuario, senha }).then((r) => lerJson<{ usuario: Usuario }>(r)),
  configurar: (codigo: string, nome: string, email: string, senha: string) =>
    postar("/api/configurar", { codigo, nome, email, senha }).then((r) => lerJson<{ usuario: Usuario }>(r)),
  sair: () => postar("/api/sair", {}).then((r) => lerJson<{ ok: true }>(r)),
  opcoes: () => fetch("/api/opcoes").then((r) => lerJson<Opcoes>(r)),

  historico: (busca: BuscaHistorico) => {
    const q = paramsHistorico(busca);
    return chamar<{ itens: ResumoIssue[]; podeVerTodos: boolean; produtos: string[] }>("GET", `/api/historico${q ? `?${q}` : ""}`);
  },
  issue: (id: number) => chamar<{ item: IssueGuardada; versoes: Versao[]; mudancasStatus: MudancaStatus[] }>("GET", `/api/historico/${id}`),
  mudarStatus: (id: number, status: StatusIssue) =>
    chamar<{ status: StatusIssue; mudancasStatus: MudancaStatus[] }>("PATCH", `/api/historico/${id}/status`, { status }),
  links: (id: number) => chamar<{ links: LinkCompartilhado[] }>("GET", `/api/historico/${id}/links`),
  criarLink: (id: number, dias: number) =>
    postar(`/api/historico/${id}/links`, { dias }).then((r) => lerJson<{ url: string; link: LinkCompartilhado }>(r)),
  revogarLink: (id: number, link: number) => chamar<{ ok: true }>("DELETE", `/api/historico/${id}/links/${link}`),
  publico: (token: string) => fetch(`/api/publico/${encodeURIComponent(token)}`).then((r) => lerJson<{ issue: IssuePublica }>(r)),
  backups: () => chamar<{ disponivel: boolean; copias: number; backups: InfoBackup[] }>("GET", "/api/admin/backups"),
  jira: () => chamar<{ ligado: boolean; url: string | null }>("GET", "/api/jira"),
  projetosJira: () => chamar<{ projetos: ProjetoJira[] }>("GET", "/api/jira/projetos"),
  tiposJira: (projeto: string) => chamar<{ tipos: TipoJira[] }>("GET", `/api/jira/tipos?projeto=${encodeURIComponent(projeto)}`),
  envioJira: (id: number) => chamar<{ envio: EnvioJira | null }>("GET", `/api/historico/${id}/jira`),
  enviarJira: (id: number, projeto: string, tipoId: string) =>
    postar(`/api/historico/${id}/jira`, { projeto, tipoId }).then((r) => lerJson<{ envio: EnvioJira }>(r)),
  auditoria: (f: FiltroAuditoria) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") p.set(k, String(v));
    return chamar<{ eventos: EventoAuditoria[]; proximo: number | null }>("GET", `/api/admin/auditoria${p.size ? `?${p}` : ""}`);
  },
  fazerBackup: () => postar("/api/admin/backups", {}).then((r) => lerJson<{ backup: InfoBackup }>(r)),
  apagarIssue: (id: number) => chamar<{ ok: true }>("DELETE", `/api/historico/${id}`),
  versao: (id: number, numero: number) => chamar<{ versao: Versao & { markdown: string } }>("GET", `/api/historico/${id}/versoes/${numero}`),

  ajustes: () => chamar<EstadoAdmin>("GET", "/api/admin/ajustes"),
  salvarAjustes: (valores: Partial<ValoresAjustes>) => chamar<EstadoAdmin>("PUT", "/api/admin/ajustes", valores),
  modelos: (provedor: NomeProvedor) => chamar<{ modelos: string[] }>("GET", `/api/admin/modelos?provedor=${provedor}`),
  usuarios: () => chamar<{ usuarios: UsuarioAdmin[] }>("GET", "/api/admin/usuarios"),
  criarUsuario: (nome: string, email: string, senha: string, admin: boolean) =>
    postar("/api/admin/usuarios", { nome, email, senha, admin }).then((r) => lerJson<{ usuario: UsuarioAdmin }>(r)),
  alterarUsuario: (id: number, mudancas: { nome?: string; admin?: boolean; ativo?: boolean; senha?: string }) =>
    chamar<{ usuario: UsuarioAdmin }>("PATCH", `/api/admin/usuarios/${id}`, mudancas),
};

/** Lê um bloco SSE ("event: x\ndata: {...}"). Comentários (": ping") são ignorados. */
function lerEvento(bloco: string): { evento: string; dados: unknown } | null {
  let evento = "";
  let dados = "";
  for (const linha of bloco.split("\n")) {
    if (linha.startsWith("event:")) evento = linha.slice(6).trim();
    else if (linha.startsWith("data:")) dados += linha.slice(5).trim();
  }
  if (!evento || !dados) return null;
  return { evento, dados: JSON.parse(dados) };
}

/**
 * Chama /api/gerar ou /api/refinar e acompanha o stream. Resolve com o resultado, rejeita com
 * ErroApi (erro do servidor ou da IA) ou com AbortError (cancelado pela pessoa).
 */
export async function transmitir(
  url: "/api/gerar" | "/api/refinar",
  corpo: unknown,
  signal: AbortSignal,
  aoProgresso: (p: Progresso) => void,
): Promise<Resultado> {
  const r = await postar(url, corpo, signal);
  if (!r.ok || !r.body) return lerJson<never>(r);

  const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, "\n");
    let fim: number;
    while ((fim = buffer.indexOf("\n\n")) >= 0) {
      const ev = lerEvento(buffer.slice(0, fim));
      buffer = buffer.slice(fim + 2);
      if (!ev) continue;
      if (ev.evento === "progresso") aoProgresso(ev.dados as Progresso);
      else if (ev.evento === "resultado") return ev.dados as Resultado;
      else if (ev.evento === "erro") throw new ErroApi(ev.dados as ErroTela, 200);
    }
  }
  throw new ErroApi(
    { codigo: "conexao", mensagem: "A conexão caiu antes do fim da geração. Tente de novo.", podeTentarDeNovo: true },
    0,
  );
}
