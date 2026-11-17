import { describe, expect, it, vi } from "vitest";
import { paramsHistorico } from "../src/api";
import { baixarPdf, metadadosPdf } from "../src/impressao";
import { lerRascunho, limparRascunho, salvarRascunho } from "../src/rascunho";

describe("rascunho automático", () => {
  const entrada = { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" };

  it("guarda e devolve o rascunho de cada pessoa separado", () => {
    salvarRascunho("ana", entrada);
    expect(lerRascunho("ana")).toEqual(entrada);
    expect(lerRascunho("bia")).toBeNull();
  });

  it("rascunho sem texto não é guardado, e limpar apaga", () => {
    salvarRascunho("ana", entrada);
    salvarRascunho("ana", { descricao: "  ", tipo: "Melhoria", produto: "", contexto: "" });
    expect(lerRascunho("ana")).toBeNull();
    salvarRascunho("ana", entrada);
    limparRascunho("ana");
    expect(lerRascunho("ana")).toBeNull();
  });

  it("ignora um rascunho corrompido", () => {
    localStorage.setItem("idg:rascunho:ana", "{não é json");
    expect(lerRascunho("ana")).toBeNull();
  });
});

describe("PDF", () => {
  it("monta o cabeçalho com produto, tipo, autor, data e versão", () => {
    const quando = new Date(2026, 10, 17, 14, 5).getTime();
    expect(metadadosPdf({ produto: "Loja", tipo: "Melhoria", autor: "ana", quando, versao: 3 })).toEqual([
      ["Produto", "Loja"],
      ["Tipo", "Melhoria"],
      ["Autor", "ana"],
      ["Data", "17/11/2026, 14:05"],
      ["Versão", "3"],
    ]);
  });

  it("abre a impressão com o nome do arquivo no título e devolve o título da página", () => {
    document.title = "Issue Doc Generator";
    let tituloNaImpressao = "";
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {
      tituloNaImpressao = document.title;
    });
    baixarPdf("# Limitar cupons por pedido\n\ntexto");
    expect(imprimir).toHaveBeenCalledOnce();
    expect(tituloNaImpressao).toBe("limitar-cupons-por-pedido");
    expect(document.title).toBe("Issue Doc Generator");
  });
});

describe("busca no histórico", () => {
  it("manda só os filtros preenchidos, com o período do dia inteiro no fuso local", () => {
    const p = new URLSearchParams(
      paramsHistorico({ todos: true, usuario: "ana", texto: " cupom ", produto: "", tipo: "Melhoria", de: "2026-11-10", ate: "2026-11-12" }),
    );
    expect(p.get("todos")).toBe("1");
    expect(p.get("usuario")).toBe("ana");
    expect(p.get("texto")).toBe("cupom");
    expect(p.has("produto")).toBe(false);
    expect(p.get("tipo")).toBe("Melhoria");
    expect(Number(p.get("de"))).toBe(new Date(2026, 10, 10).getTime());
    expect(Number(p.get("ate"))).toBe(new Date(2026, 10, 12, 23, 59, 59, 999).getTime());
    expect(paramsHistorico({ todos: false })).toBe("");
  });
});
