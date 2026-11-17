import { describe, expect, it } from "vitest";
import { celulaCsv, gerarCsv, type IssueCsv } from "../src/csv";

const ISSUE: IssueCsv = {
  titulo: "Limitar cupons por pedido",
  casos: [
    { id: "CT2", criterio: "CA1", tipo: "limite", dado: "3 cupons aplicados", quando: "aplico o 4º", entao: 'aviso "Máximo de 3"', tecnica: "Valor limite (4.2.2)", item_cobertura: "4" },
    { id: "CT1", criterio: "CA1", tipo: "feliz", dado: "carrinho com itens", quando: "aplico 1 cupom", entao: "desconto aplicado", tecnica: "Partição (4.2.1)", item_cobertura: "válido" },
  ],
};

function linhas(csv: string) {
  expect(csv.startsWith("﻿")).toBe(true);
  return csv.slice(1).trimEnd().split("\r\n");
}

describe("casos de teste em CSV", () => {
  it("escapa aspas, vírgulas e quebras de linha, e neutraliza fórmulas de planilha", () => {
    expect(celulaCsv('diz "oi", tchau')).toBe('"diz ""oi"", tchau"');
    expect(celulaCsv("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    for (const perigoso of ["=1+1", "+cmd", "-2", "@soma", "\tx"]) expect(celulaCsv(perigoso)).toBe(`"'${perigoso}"`);
  });

  it("TestRail: um caso por linha, na ordem feliz → limite, com pré-condição, passo e resultado", () => {
    const [cab, l1, l2] = linhas(gerarCsv(ISSUE, "testrail"));
    expect(cab).toBe('"Title","Section","Type","Preconditions","Steps","Expected Result","References"');
    expect(l1).toBe('"CT1 - aplico 1 cupom","Limitar cupons por pedido","Feliz","carrinho com itens","aplico 1 cupom","desconto aplicado","CA1"');
    expect(l2).toContain('"aviso ""Máximo de 3"""');
  });

  it("Xray: teste manual com ação, dados e resultado", () => {
    const [cab, l1] = linhas(gerarCsv(ISSUE, "xray"));
    expect(cab).toBe('"Issue ID","Summary","Test Type","Description","Action","Data","Result","Labels"');
    expect(l1).toBe(
      '"1","CT1 - aplico 1 cupom","Manual","Partição (4.2.1) — válido. Critério: CA1.","aplico 1 cupom","carrinho com itens","desconto aplicado","CA1"',
    );
  });

  it("Zephyr Scale: nome, objetivo, pré-condição e o passo a passo", () => {
    const [cab, l1] = linhas(gerarCsv(ISSUE, "zephyr"));
    expect(cab).toBe(
      '"Name","Objective","Precondition","Folder","Labels","Test Script (Step-by-Step) - Step","Test Script (Step-by-Step) - Test Data","Test Script (Step-by-Step) - Expected Result"',
    );
    expect(l1).toBe(
      '"CT1 - aplico 1 cupom","Partição (4.2.1) — válido. Critério: CA1.","carrinho com itens","Limitar cupons por pedido","CA1","aplico 1 cupom","","desconto aplicado"',
    );
  });

  it("issue sem casos gera só o cabeçalho", () => {
    expect(linhas(gerarCsv({ titulo: "x", casos: [] }, "testrail"))).toHaveLength(1);
  });
});
