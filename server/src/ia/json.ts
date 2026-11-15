import { issueJsonSchema } from "../issue/schema.js";

/**
 * Extrai o objeto JSON do texto da IA. Com saída estruturada o texto já é JSON puro; servidores
 * compatíveis com a OpenAI às vezes devolvem cercado por ```json … ```, e isso é tolerado.
 */
export function extrairJson(texto: string): unknown {
  let t = texto.trim();
  const cerca = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  if (cerca) t = cerca[1].trim();
  if (!t.startsWith("{")) {
    const inicio = t.indexOf("{");
    const fim = t.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) t = t.slice(inicio, fim + 1);
  }
  return JSON.parse(t);
}

// Campos de primeiro nível na ordem do schema, com o nome que a tela mostra no progresso.
const SECOES: [string, string][] = [
  ["titulo", "Cabeçalho"],
  ["problema", "Problema"],
  ["solucao", "Solução"],
  ["contexto", "Contexto e Objetivo"],
  ["estados", "Estados / Ciclo de vida"],
  ["regras", "Regras de Negócio"],
  ["fluxo_decisao", "Fluxo de decisão"],
  ["interface", "Interface"],
  ["mensagens", "Mensagens"],
  ["escopo", "Escopo e impacto"],
  ["fora_de_escopo", "Fora de escopo"],
  ["criterios", "Critérios de Aceite"],
  ["casos", "Casos de teste"],
  ["revisao", "Revisão da task"],
];

/** Qual seção a IA está escrevendo agora, olhando o JSON parcial recebido até aqui. */
export function secaoAtual(parcial: string): string | null {
  let atual: string | null = null;
  let maior = -1;
  for (const [chave, rotulo] of SECOES) {
    const pos = parcial.lastIndexOf(`"${chave}":`);
    const pos2 = parcial.lastIndexOf(`"${chave}" :`);
    const p = Math.max(pos, pos2);
    if (p > maior) {
      maior = p;
      atual = rotulo;
    }
  }
  return atual;
}

/** JSON Schema da issue sem a chave $schema (alguns provedores a recusam). */
export function schemaParaProvedor(): Record<string, unknown> {
  const { $schema: _, ...resto } = issueJsonSchema() as Record<string, unknown>;
  return resto;
}
