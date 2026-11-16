import type { Uso } from "./ia/tipos.js";

/** Preço em US$ por milhão de tokens. */
export type Preco = { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number };

// Preços públicos da Claude API (por MTok). A escrita de cache de 5 minutos custa 1,25x a entrada.
// Para outros provedores, ou se o preço mudar, use PRECO_POR_MTOK no .env.
const PRECOS: Record<string, Preco> = {
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLeitura: 0.2, cacheEscrita: 5 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLeitura: 0.1, cacheEscrita: 2.5 },
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5, cacheLeitura: 0.01, cacheEscrita: 0.125 },
  "claude-fable-5-2": { entrada: 8, saida: 40, cacheLeitura: 0.2, cacheEscrita: 10 },
};

/** Lê "entrada,saida,cacheLeitura,cacheEscrita" (US$ por MTok). Vazio ou inválido = null. */
export function lerPreco(texto: string): Preco | null {
  const n = texto.split(",").map((v) => Number(v.trim()));
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v) || v < 0)) return null;
  return { entrada: n[0], saida: n[1], cacheLeitura: n[2], cacheEscrita: n[3] };
}

/** Custo estimado em US$, ou null quando o preço do modelo não é conhecido. */
export function custoEstimado(modelo: string, uso: Uso, precoConfigurado: Preco | null): number | null {
  const p = precoConfigurado ?? PRECOS[modelo];
  if (!p) return null;
  const total =
    (uso.entrada * p.entrada + uso.saida * p.saida + uso.cacheLeitura * p.cacheLeitura + uso.cacheEscrita * p.cacheEscrita) /
    1_000_000;
  return Math.round(total * 10_000) / 10_000;
}
