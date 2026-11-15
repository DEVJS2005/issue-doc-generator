import type { Exemplo } from "../entrada.js";
import { exemploPedidosPagamentoAprovado } from "./01-pedidos-pagamento-aprovado.js";
import { exemploGestaoDeMarcas } from "./02-gestao-de-marcas.js";

// Exemplos completos do prompt (few-shot), nesta ordem. Mudar um exemplo muda o prompt e
// recria o cache na próxima chamada. Use sempre dados fictícios.
export const EXEMPLOS: Exemplo[] = [exemploPedidosPagamentoAprovado, exemploGestaoDeMarcas];
