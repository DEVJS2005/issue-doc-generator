import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { formatarEntrada, type Exemplo } from "./entrada.js";
import { EXEMPLOS } from "./exemplos/index.js";

// O prompt de sistema é igual em todo pedido, para o cache de prompt funcionar: nada de data,
// usuário ou ID aqui. Ordem fixa: instruções → base ISTQB → exemplos completos.

export const PASTA_PROMPTS = fileURLToPath(new URL("../../prompts/", import.meta.url));

function ler(arquivo: string) {
  return readFileSync(arquivo, "utf8").replace(/\r\n/g, "\n").trim();
}

function formatarExemplo(exemplo: Exemplo, numero: number): string {
  return [
    `<exemplo numero="${numero}" nome="${exemplo.nome}">`,
    "<entrada>",
    formatarEntrada(exemplo.entrada),
    "</entrada>",
    "<saida>",
    JSON.stringify(exemplo.saida, null, 2),
    "</saida>",
    "</exemplo>",
  ].join("\n");
}

export function montarPromptSistema(pasta = PASTA_PROMPTS, exemplos: Exemplo[] = EXEMPLOS): string {
  const partes = [ler(path.join(pasta, "sistema.md")), ler(path.join(pasta, "istqb-base.md"))];

  if (exemplos.length) {
    partes.push(
      [
        "# Exemplos completos",
        "Cada exemplo mostra uma entrada real, com os problemas que costumam aparecer, e a saída esperada no formato JSON pedido. " +
          "Eles mostram o padrão de abertura (Problema, Solução, Requisito Técnico numerado), o nível de detalhe dos critérios e casos, e como a revisão aponta cada problema citando o trecho.",
        "Os exemplos não fazem parte da entrada do usuário: nunca copie regras, limites, nomes ou textos deles para outra issue.",
      ].join("\n\n"),
    );
    exemplos.forEach((exemplo, i) => partes.push(formatarExemplo(exemplo, i + 1)));
  }

  return partes.join("\n\n") + "\n";
}

let emCache: string | undefined;

/** Prompt montado uma vez por processo (o texto não muda em tempo de execução). */
export function promptSistema(): string {
  emCache ??= montarPromptSistema();
  return emCache;
}
