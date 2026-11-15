import { describe, expect, it } from "vitest";
import { verificarCoerencia } from "../src/issue/coerencia.js";
import { celula, montarMarkdown, ordenarCasos } from "../src/issue/markdown.js";
import { issueJsonSchema, validarIssue } from "../src/issue/schema.js";
import { issueExemplo } from "./fixtures/issue.js";

describe("schema da issue", () => {
  it("aceita uma issue completa", () => {
    expect(validarIssue(issueExemplo()).success).toBe(true);
  });

  it("aceita listas vazias", () => {
    const i = { ...issueExemplo(), estados: [], regras: [], interface: [], mensagens: [], casos: [], criterios: [] };
    expect(validarIssue(i).success).toBe(true);
  });

  it("recusa campo obrigatório ausente", () => {
    const { revisao: _, ...semRevisao } = issueExemplo();
    expect(validarIssue(semRevisao).success).toBe(false);
  });

  it("recusa tipo de caso fora da lista", () => {
    const i = issueExemplo();
    (i.casos[0] as { tipo: string }).tipo = "positivo";
    expect(validarIssue(i).success).toBe(false);
  });

  it("recusa tipo de issue fora da lista", () => {
    expect(validarIssue({ ...issueExemplo(), tipo: "Bug" }).success).toBe(false);
  });

  it("gera JSON Schema compatível com os provedores (tudo obrigatório, sem campos extras)", () => {
    const schema = issueJsonSchema() as Record<string, unknown>;
    const texto = JSON.stringify(schema);
    expect(texto).not.toMatch(/minLength|maxLength|minimum|maximum|minItems|maxItems/);

    const objetos: Record<string, unknown>[] = [];
    const visitar = (n: unknown) => {
      if (n && typeof n === "object") {
        const o = n as Record<string, unknown>;
        if (o.type === "object") objetos.push(o);
        Object.values(o).forEach(visitar);
      }
    };
    visitar(schema);
    expect(objetos.length).toBeGreaterThan(5);
    for (const o of objetos) {
      expect(o.additionalProperties).toBe(false);
      expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort());
    }
  });
});

describe("montagem do Markdown", () => {
  const md = montarMarkdown(issueExemplo());

  it("tem todas as seções na ordem do formato", () => {
    const titulos = [
      "# Limitar cupons por pedido",
      "## Problema",
      "## Solução",
      "## Requisito Técnico",
      "### 1. Contexto e Objetivo",
      "### 2. Estados / Ciclo de vida",
      "### 3. Regras de Negócio",
      "### 4. Interface",
      "### 5. Escopo e impacto",
      "### 6. Fora de escopo",
      "## Critérios de Aceite",
      "## Casos de teste",
      "## Revisão da task",
      "### Dúvidas para o PO",
    ];
    const linhas = md.split("\n");
    const posicoes = titulos.map((t) => linhas.indexOf(t));
    posicoes.forEach((p, i) => expect(p, titulos[i]).toBeGreaterThanOrEqual(0));
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });

  it("monta o cabeçalho com os campos da issue", () => {
    expect(md).toContain("| Tipo | Melhoria |");
    expect(md).toContain("| Módulo/Tela | Checkout |");
    expect(md).toContain("| Prioridade | [a preencher] |");
  });

  it("mantém a numeração quando não há status", () => {
    const semStatus = montarMarkdown({ ...issueExemplo(), estados: [] });
    expect(semStatus).toContain("### 2. Estados / Ciclo de vida\n\n_Não se aplica: esta issue não tem status._");
  });

  it("marca status final na coluna 'Vai para'", () => {
    expect(md).toContain("| Expirado | Cupom fora da validade | — (final) | Sistema |");
  });

  it("escapa pipes e quebras de linha nas tabelas", () => {
    expect(celula("a | b\nc")).toBe("a \\| b<br>c");
    expect(md).toContain("Até 20 caracteres \\| só letras e números");
  });

  it("põe o caso feliz antes do caso limite", () => {
    expect(md.indexOf("| CT1 | CA1 | Feliz |")).toBeGreaterThan(0);
    expect(md.indexOf("| CT1 | CA1 | Feliz |")).toBeLessThan(md.indexOf("| CT2 | CA1 | Limite |"));
  });

  it("ordena casos por tipo sem embaralhar os do mesmo tipo", () => {
    const base = issueExemplo().casos[1];
    const casos = [
      { ...base, id: "A", tipo: "negativo" as const },
      { ...base, id: "B", tipo: "feliz" as const },
      { ...base, id: "C", tipo: "negativo" as const },
      { ...base, id: "D", tipo: "feliz" as const },
    ];
    expect(ordenarCasos(casos).map((c) => c.id)).toEqual(["B", "D", "A", "C"]);
  });

  it("escreve critérios como checklist com as regras cobertas", () => {
    expect(md).toContain("- [ ] **CA1** Com 3 cupons aplicados, o 4º é recusado. _(cobre: RN1)_");
  });

  it("escreve a revisão com itens marcados e dúvidas citando o trecho", () => {
    expect(md).toContain("- [x] Todas as seções preenchidas");
    expect(md).toContain("- [ ] Todo comportamento tem mensagem exata");
    expect(md).toContain("1. > o 4º é recusado\n\n   Qual o texto exato da mensagem de erro?");
  });

  it("inclui o fluxo de decisão só quando existe", () => {
    expect(md).not.toContain("Fluxo de decisão");
    const comFluxo = montarMarkdown({ ...issueExemplo(), fluxo_decisao: "SE pago → integra\nSENÃO → ignora" });
    expect(comFluxo).toContain("**Fluxo de decisão**\n\n```text\nSE pago → integra\nSENÃO → ignora\n```");
  });

  it("é determinística", () => {
    expect(montarMarkdown(issueExemplo())).toBe(md);
  });
});

describe("coerência da issue", () => {
  it("não avisa nada numa issue coerente", () => {
    expect(verificarCoerencia(issueExemplo())).toEqual([]);
  });

  it("avisa critério sem caso feliz", () => {
    const i = issueExemplo();
    i.casos = i.casos.filter((c) => c.tipo !== "feliz");
    expect(verificarCoerencia(i).map((a) => a.codigo)).toContain("criterio_sem_feliz");
  });

  it("avisa regra sem critério e critério citando regra inexistente", () => {
    const i = issueExemplo();
    i.regras.push({ id: "RN2", regra: "x → y", exemplo: "z" });
    i.criterios[0].regras_cobertas.push("RN9");
    const codigos = verificarCoerencia(i).map((a) => a.codigo);
    expect(codigos).toContain("regra_sem_criterio");
    expect(codigos).toContain("regra_inexistente");
  });

  it("avisa caso apontando para critério inexistente e IDs duplicados", () => {
    const i = issueExemplo();
    i.casos[0].criterio = "CA7";
    i.casos[1].id = "CT2";
    const codigos = verificarCoerencia(i).map((a) => a.codigo);
    expect(codigos).toContain("caso_sem_criterio");
    expect(codigos).toContain("id_duplicado");
  });
});
