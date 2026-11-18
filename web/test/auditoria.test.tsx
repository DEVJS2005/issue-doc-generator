import { describe, expect, it } from "vitest";
import { descreverDetalhe, ROTULO_ACAO } from "../src/Auditoria";

describe("auditoria na tela", () => {
  it("tem rótulo para todas as ações", () => {
    for (const rotulo of Object.values(ROTULO_ACAO)) expect(rotulo.length).toBeGreaterThan(2);
  });

  it("descreve o detalhe sem mostrar senhas", () => {
    expect(descreverDetalhe({ acao: "alterar_usuario", detalhe: { campos: ["senha", "ativo"], ativo: false } })).toBe("trocou a senha · ativo: não");
    expect(descreverDetalhe({ acao: "login_falhou", detalhe: { tentativa: "ana" } })).toBe("tentou como “ana”");
    expect(descreverDetalhe({ acao: "gerar", detalhe: { tipo: "Melhoria", produto: "Loja", idioma: "pt-BR" } })).toBe("Melhoria · Loja");
    expect(descreverDetalhe({ acao: "gerar", detalhe: { tipo: "Melhoria", produto: "Loja", idioma: "en" } })).toBe("Melhoria · Loja · en");
    expect(descreverDetalhe({ acao: "backup", detalhe: null })).toBe("");
  });
});
