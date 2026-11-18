import type { ImagemAnexa } from "./imagens.js";

// Contrato comum a todos os provedores de IA. Cada provedor só sabe pedir e devolver texto:
// a validação do JSON, o Markdown e os avisos ficam numa camada única (gerar.ts).

export type NomeProvedor = "anthropic" | "openai" | "openai_compativel" | "gemini";

export type Uso = {
  /** Tokens de entrada cobrados a preço cheio (sem os lidos do cache). */
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
};

export type Progresso =
  | { fase: "analisando" }
  | { fase: "escrevendo"; delta: string };

export type PedidoIA = {
  /** Prompt de sistema: idêntico em todo pedido, para o cache de prompt funcionar. */
  sistema: string;
  /** Mensagem do usuário: a entrada formatada (e, no refinamento, a issue atual e o ajuste). */
  usuario: string;
  /** Prints anexados à descrição (só na geração; não vão para o histórico). */
  imagens?: ImagemAnexa[];
};

export type RespostaIA = {
  texto: string;
  uso: Uso;
  /** Modelo que de fato respondeu (pode ser o de fallback). */
  modelo: string;
  /** true quando o fallback de recusa do provedor assumiu a resposta. */
  usouFallback: boolean;
};

export interface Provedor {
  readonly nome: NomeProvedor;
  readonly modelo: string;
  gerar(
    pedido: PedidoIA,
    opcoes: { signal: AbortSignal; aoProgresso: (p: Progresso) => void },
  ): Promise<RespostaIA>;
}

export const USO_ZERADO: Uso = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };
