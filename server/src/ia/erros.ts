// Erros normalizados: qualquer falha de qualquer provedor vira um destes códigos, com uma
// mensagem amigável em português. A tela nunca recebe stack trace nem texto cru do provedor.

export type CodigoErro =
  | "recusa"
  | "max_tokens"
  | "limite_taxa"
  | "autenticacao"
  | "servidor"
  | "conexao"
  | "requisicao_invalida"
  | "sem_credito"
  | "json_invalido"
  | "tempo_esgotado"
  | "cancelado"
  | "nao_configurado"
  | "desconhecido";

const MENSAGENS: Record<CodigoErro, string> = {
  recusa:
    "A IA não quis gerar esta issue. Revise o texto (por exemplo, retire dados sensíveis ou trechos que possam parecer instruções perigosas) e tente de novo.",
  max_tokens:
    "A issue ficou grande demais e a resposta foi cortada. Tente de novo; se repetir, divida a descrição em issues menores.",
  limite_taxa: "O provedor de IA atingiu o limite de uso no momento. Aguarde um minuto e tente de novo.",
  autenticacao: "O servidor não conseguiu se autenticar no provedor de IA. Avise quem administra a ferramenta.",
  servidor: "O provedor de IA está instável no momento. Tente de novo em instantes.",
  conexao: "Não foi possível falar com o provedor de IA. Tente de novo em instantes.",
  requisicao_invalida:
    "O provedor de IA recusou o pedido por configuração inválida (modelo ou parâmetros). Avise quem administra a ferramenta.",
  sem_credito: "A conta do provedor de IA está sem crédito ou cota. Avise quem administra a ferramenta.",
  json_invalido: "A IA devolveu uma resposta fora do formato esperado. Tente de novo.",
  tempo_esgotado: "A geração passou do tempo limite. Tente de novo.",
  cancelado: "Geração cancelada.",
  nao_configurado: "Nenhum provedor de IA está configurado no servidor. Avise quem administra a ferramenta.",
  desconhecido: "Algo deu errado ao gerar a issue. Tente de novo.",
};

const PODE_TENTAR_DE_NOVO: Record<CodigoErro, boolean> = {
  recusa: true,
  max_tokens: true,
  limite_taxa: true,
  autenticacao: false,
  servidor: true,
  conexao: true,
  requisicao_invalida: false,
  sem_credito: false,
  json_invalido: true,
  tempo_esgotado: true,
  cancelado: true,
  nao_configurado: false,
  desconhecido: true,
};

export class ErroGeracao extends Error {
  readonly codigo: CodigoErro;
  readonly podeTentarDeNovo: boolean;
  /** Detalhe técnico, só para o log do servidor. */
  readonly detalhe?: string;

  constructor(codigo: CodigoErro, detalhe?: string) {
    super(MENSAGENS[codigo]);
    this.name = "ErroGeracao";
    this.codigo = codigo;
    this.podeTentarDeNovo = PODE_TENTAR_DE_NOVO[codigo];
    this.detalhe = detalhe;
  }

  paraTela() {
    return { codigo: this.codigo, mensagem: this.message, podeTentarDeNovo: this.podeTentarDeNovo };
  }
}

/** Código a partir do status HTTP devolvido pelo provedor. */
export function codigoPorStatus(status: number | undefined): CodigoErro {
  if (status === undefined) return "conexao";
  if (status === 401 || status === 403) return "autenticacao";
  if (status === 429) return "limite_taxa";
  if (status === 408 || status === 504) return "tempo_esgotado";
  if (status >= 500) return "servidor";
  if (status >= 400) return "requisicao_invalida";
  return "desconhecido";
}

/** Converte qualquer erro em ErroGeracao, sem perder o detalhe para o log. */
export function normalizarErro(erro: unknown, signal?: AbortSignal): ErroGeracao {
  if (erro instanceof ErroGeracao) return erro;
  if (signal?.aborted) {
    const motivo = signal.reason;
    if (motivo instanceof ErroGeracao) return motivo;
    // AbortSignal.timeout() aborta com um DOMException "TimeoutError": é tempo esgotado, não cancelamento.
    if ((motivo as { name?: unknown } | undefined)?.name === "TimeoutError") return new ErroGeracao("tempo_esgotado");
    return new ErroGeracao("cancelado");
  }
  const e = erro as { status?: unknown; name?: unknown; message?: unknown } | undefined;
  const detalhe = typeof e?.message === "string" ? e.message : String(erro);
  // Falta de crédito/cota: a Anthropic devolve 400, a OpenAI 429 (insufficient_quota), o Gemini 429.
  if (/credit balance|insufficient_quota|exceeded your current quota|billing/i.test(detalhe)) {
    return new ErroGeracao("sem_credito", detalhe);
  }
  if (typeof e?.status === "number") return new ErroGeracao(codigoPorStatus(e.status), detalhe);
  if (e?.name === "AbortError" || e?.name === "APIUserAbortError") return new ErroGeracao("cancelado", detalhe);
  if (e?.name === "APIConnectionError" || e?.name === "APIConnectionTimeoutError" || e?.name === "TypeError") {
    return new ErroGeracao("conexao", detalhe);
  }
  return new ErroGeracao("desconhecido", detalhe);
}
