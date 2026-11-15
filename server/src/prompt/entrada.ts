import type { Issue } from "../issue/schema.js";
import { TIPOS_ISSUE } from "../issue/schema.js";

export type Entrada = {
  descricao: string;
  tipo: (typeof TIPOS_ISSUE)[number];
  produto: string;
  contexto: string;
};

export type Exemplo = {
  /** Nome curto, só para leitura humana e testes. */
  nome: string;
  entrada: Entrada;
  saida: Issue;
};

const TAGS = /<\/?\s*(tipo|produto|descricao|contexto|issue_atual|ajuste)\s*>/gi;

/** Remove tags nossas de dentro do texto do usuário, para ele não fechar a tag antes da hora. */
function limpar(texto: string): string {
  return texto.replace(/\r\n/g, "\n").replace(TAGS, "").trim();
}

/** Texto da entrada exatamente como a IA recebe, tanto nos pedidos quanto nos exemplos do prompt. */
export function formatarEntrada(e: Entrada): string {
  return [
    `<tipo>${e.tipo}</tipo>`,
    `<produto>${limpar(e.produto)}</produto>`,
    `<descricao>\n${limpar(e.descricao)}\n</descricao>`,
    `<contexto>\n${limpar(e.contexto) || "(vazio)"}\n</contexto>`,
  ].join("\n");
}
