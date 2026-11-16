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

export type Usuario = { email: string };
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
};

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

export const api = {
  sessao: () => fetch("/api/sessao").then((r) => lerJson<{ usuario: Usuario }>(r)),
  entrar: (email: string, senha: string) => postar("/api/login", { email, senha }).then((r) => lerJson<{ usuario: Usuario }>(r)),
  sair: () => postar("/api/sair", {}).then((r) => lerJson<{ ok: true }>(r)),
  opcoes: () => fetch("/api/opcoes").then((r) => lerJson<Opcoes>(r)),
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
