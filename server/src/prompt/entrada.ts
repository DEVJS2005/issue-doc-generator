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

// Nossas tags, também escritas com "<", ">" e "/" de largura total ou pequenos (que a IA pode ler
// como os comuns) e com espaços no meio.
const TAGS = /[<＜﹤]\s*[/／]?\s*(tipo|produto|descricao|contexto_do_sistema|contexto|idioma|imagens|issue_atual|ajuste)\s*[>＞﹥]/gi;

/**
 * Remove tags nossas de dentro do texto do usuário, para ele não fechar a tag antes da hora nem
 * abrir outra. Repete até não sobrar nenhuma: "</desc</descricao>ricao>" vira "</descricao>"
 * depois de uma passada só.
 */
export function limpar(texto: string): string {
  let atual = texto.replace(/\r\n/g, "\n");
  for (let anterior = ""; anterior !== atual; ) {
    anterior = atual;
    atual = atual.replace(TAGS, "");
  }
  return atual.trim();
}

/**
 * "Meu contexto" da pessoa, já compacto, como bloco próprio antes da mensagem. Fica igual entre os
 * pedidos dela, para o cache de prompt reaproveitar. Vazio = sem bloco.
 */
export function formatarContextoSistema(compacto: string): string {
  const texto = limpar(compacto);
  return texto ? `<contexto_do_sistema>\n${texto}\n</contexto_do_sistema>` : "";
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
export function formatarEntrada(e: Entrada, imagens = 0): string {
  return [
    `<tipo>${e.tipo}</tipo>`,
    ...(e.idioma && e.idioma !== "pt-BR" ? [`<idioma>${e.idioma}</idioma>`] : []),
    `<produto>${limpar(e.produto)}</produto>`,
    `<descricao>\n${limpar(e.descricao)}\n</descricao>`,
    `<contexto>\n${limpar(e.contexto) || "(vazio)"}\n</contexto>`,
    // Só com anexos, para os pedidos sem imagem (e os exemplos) não mudarem.
    ...(imagens > 0 ? [`<imagens>${imagens}</imagens>`] : []),
  ].join("\n");
}
