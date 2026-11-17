// Casos de teste em CSV, no formato de importação do TestRail, do Xray (Jira) e do Zephyr Scale.
// Um caso por linha, com um passo só: Dado = pré-condição, Quando = passo, Então = resultado.

export type CasoCsv = {
  id: string;
  criterio: string;
  tipo: string;
  dado: string;
  quando: string;
  entao: string;
  tecnica: string;
  item_cobertura: string;
};
export type IssueCsv = { titulo: string; casos: CasoCsv[] };
export type FormatoCsv = "testrail" | "xray" | "zephyr";

export const FORMATOS_CSV: { valor: FormatoCsv; rotulo: string }[] = [
  { valor: "testrail", rotulo: "TestRail" },
  { valor: "xray", rotulo: "Xray (Jira)" },
  { valor: "zephyr", rotulo: "Zephyr Scale" },
];

const ORDEM = ["feliz", "alternativo", "negativo", "limite", "nao_funcional"];
const ROTULO_TIPO: Record<string, string> = {
  feliz: "Feliz",
  alternativo: "Alternativo",
  negativo: "Negativo",
  limite: "Limite",
  nao_funcional: "Não funcional",
};

/**
 * Uma célula entre aspas, com as aspas internas dobradas. Texto que começa com = + - @ ou tab
 * ganha um apóstrofo na frente, para a planilha não o executar como fórmula.
 */
export function celulaCsv(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return `"${seguro.replace(/"/g, '""')}"`;
}

const resumo = (texto: string) => {
  const t = texto.trim().replace(/\s+/g, " ");
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
};

export function gerarCsv(issue: IssueCsv, formato: FormatoCsv): string {
  const casos = issue.casos
    .map((c, i) => ({ c, i }))
    .sort((a, b) => ORDEM.indexOf(a.c.tipo) - ORDEM.indexOf(b.c.tipo) || a.i - b.i)
    .map(({ c }) => c);
  const titulo = (c: CasoCsv) => `${c.id} - ${resumo(c.quando)}`;
  const objetivo = (c: CasoCsv) => `${c.tecnica.trim()} — ${c.item_cobertura.trim()}. Critério: ${c.criterio}.`;

  let cabecalho: string[];
  let linhas: string[][];
  if (formato === "testrail") {
    cabecalho = ["Title", "Section", "Type", "Preconditions", "Steps", "Expected Result", "References"];
    linhas = casos.map((c) => [titulo(c), issue.titulo, ROTULO_TIPO[c.tipo] ?? c.tipo, c.dado, c.quando, c.entao, c.criterio]);
  } else if (formato === "xray") {
    cabecalho = ["Issue ID", "Summary", "Test Type", "Description", "Action", "Data", "Result", "Labels"];
    linhas = casos.map((c, i) => [String(i + 1), titulo(c), "Manual", objetivo(c), c.quando, c.dado, c.entao, c.criterio]);
  } else {
    cabecalho = [
      "Name",
      "Objective",
      "Precondition",
      "Folder",
      "Labels",
      "Test Script (Step-by-Step) - Step",
      "Test Script (Step-by-Step) - Test Data",
      "Test Script (Step-by-Step) - Expected Result",
    ];
    linhas = casos.map((c) => [titulo(c), objetivo(c), c.dado, issue.titulo, c.criterio, c.quando, "", c.entao]);
  }
  // BOM: o Excel abre o UTF-8 com os acentos certos.
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map((v) => celulaCsv(v.trim())).join(",")).join("\r\n") + "\r\n";
}
