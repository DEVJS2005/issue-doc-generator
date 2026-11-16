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

export type Usuario = { email: string; admin: boolean };
export type Opcoes = {
  tipos: string[];
  limites: { descricao: number; contexto: number; ajuste: number };
};
export type Entrada = { descricao: string; tipo: string; produto: string; contexto: string };
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
  usuario: string;
  titulo: string;
  tipo: string;
  produto: string;
  criadaEm: number;
  atualizadaEm: number;
  versoes: number;
  modelo: string;
};
export type IssueGuardada = ResumoIssue & { entrada: Entrada; issue: unknown; markdown: string };
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
};
export type InfoProvedor = { nome: NomeProvedor; rotulo: string; disponivel: boolean; motivo: string | null; modeloPadrao: string };
export type Alteracao = { quando: number; quem: string; chave: string; de: unknown; para: unknown };
export type EstadoAdmin = { valores: ValoresAjustes; provedores: InfoProvedor[]; alteracoes: Alteracao[] };
export type UsuarioAdmin = { id: number; email: string; admin: boolean; ativo: boolean; criadoEm: number; atualizadoEm: number };

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

/** Sessão: 401 vem com `precisaConfigurar` quando o banco ainda não tem nenhum usuário. */
export async function lerSessao(): Promise<{ usuario: Usuario | null; precisaConfigurar: boolean }> {
  const r = await fetch("/api/sessao");
  const corpo = await r.json().catch(() => ({}));
  return r.ok ? { usuario: corpo.usuario, precisaConfigurar: false } : { usuario: null, precisaConfigurar: Boolean(corpo.precisaConfigurar) };
}

export const api = {
  entrar: (email: string, senha: string) => postar("/api/login", { email, senha }).then((r) => lerJson<{ usuario: Usuario }>(r)),
  configurar: (codigo: string, email: string, senha: string) =>
    postar("/api/configurar", { codigo, email, senha }).then((r) => lerJson<{ usuario: Usuario }>(r)),
  sair: () => postar("/api/sair", {}).then((r) => lerJson<{ ok: true }>(r)),
  opcoes: () => fetch("/api/opcoes").then((r) => lerJson<Opcoes>(r)),

  historico: (todos: boolean, usuario = "") =>
    chamar<{ itens: ResumoIssue[]; podeVerTodos: boolean }>(
      "GET",
      `/api/historico${todos ? `?todos=1${usuario ? `&usuario=${encodeURIComponent(usuario)}` : ""}` : ""}`,
    ),
  issue: (id: number) => chamar<{ item: IssueGuardada; versoes: Versao[] }>("GET", `/api/historico/${id}`),
  apagarIssue: (id: number) => chamar<{ ok: true }>("DELETE", `/api/historico/${id}`),

  ajustes: () => chamar<EstadoAdmin>("GET", "/api/admin/ajustes"),
  salvarAjustes: (valores: Partial<ValoresAjustes>) => chamar<EstadoAdmin>("PUT", "/api/admin/ajustes", valores),
  modelos: (provedor: NomeProvedor) => chamar<{ modelos: string[] }>("GET", `/api/admin/modelos?provedor=${provedor}`),
  usuarios: () => chamar<{ usuarios: UsuarioAdmin[] }>("GET", "/api/admin/usuarios"),
  criarUsuario: (email: string, senha: string, admin: boolean) =>
    postar("/api/admin/usuarios", { email, senha, admin }).then((r) => lerJson<{ usuario: UsuarioAdmin }>(r)),
  alterarUsuario: (id: number, mudancas: { admin?: boolean; ativo?: boolean; senha?: string }) =>
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
