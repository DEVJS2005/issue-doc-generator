import type { Issue } from "../issue/schema.js";
import { TIPOS_ISSUE } from "../issue/schema.js";

/** Idiomas em que a issue pode ser escrita. Sem idioma (ou pt-BR), português do Brasil. */
export const IDIOMAS = ["pt-BR", "en", "es"] as const;
export type Idioma = (typeof IDIOMAS)[number];

export type Entrada = {
  descricao: string;
  tipo: (typeof TIPOS_ISSUE)[number];
  produto: string;
  contexto: string;
  idioma?: Idioma;
};

export type Exemplo = {
  /** Nome curto, só para leitura humana e testes. */
  nome: string;
  entrada: Entrada;
  saida: Issue;
};

const TAGS = /<\/?\s*(tipo|produto|descricao|contexto|idioma|issue_atual|ajuste)\s*>/gi;

/** Remove tags nossas de dentro do texto do usuário, para ele não fechar a tag antes da hora. */
function limpar(texto: string): string {
  return texto.replace(/\r\n/g, "\n").replace(TAGS, "").trim();
}

/**
 * Pedido de refinamento: a entrada original (para a IA não perder o contexto nem inventar), a
 * issue atual em JSON e o ajuste pedido. O prompt de sistema manda mudar só o que o ajuste pede.
 */
export function formatarRefinamento(entrada: Entrada, issueAtual: Issue, ajuste: string): string {
  return [
    formatarEntrada(entrada),
    `<issue_atual>\n${limpar(JSON.stringify(issueAtual, null, 2))}\n</issue_atual>`,
    `<ajuste>\n${limpar(ajuste)}\n</ajuste>`,
  ].join("\n");
}

/**
 * Texto da entrada exatamente como a IA recebe, tanto nos pedidos quanto nos exemplos do prompt. A
 * tag <idioma> só vai fora do português, para os pedidos em português (e os exemplos) não mudarem.
 */
export function formatarEntrada(e: Entrada): string {
  return [
    `<tipo>${e.tipo}</tipo>`,
    ...(e.idioma && e.idioma !== "pt-BR" ? [`<idioma>${e.idioma}</idioma>`] : []),
    `<produto>${limpar(e.produto)}</produto>`,
    `<descricao>\n${limpar(e.descricao)}\n</descricao>`,
    `<contexto>\n${limpar(e.contexto) || "(vazio)"}\n</contexto>`,
  ].join("\n");
}
