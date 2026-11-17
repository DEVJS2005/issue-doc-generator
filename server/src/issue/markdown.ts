import { TIPOS_CASO, type Caso, type Issue, type TipoCaso } from "./schema.js";

// Monta o Markdown final sempre a partir do JSON validado: as seções saem na mesma ordem e
// nenhuma falta. Seção sem conteúdo ganha uma linha "Não se aplica" para manter a numeração.

const ROTULO_CASO: Record<TipoCaso, string> = {
  feliz: "Feliz",
  alternativo: "Alternativo",
  negativo: "Negativo",
  limite: "Limite",
  nao_funcional: "Não funcional",
};

const NAO_SE_APLICA = "_Não se aplica._";

/**
 * Deixa um texto seguro para uma célula de tabela GFM (barras invertidas, pipes e quebras de linha).
 * A barra vem primeiro: sem isso, "a\|b" viraria "a\\|b", e o "|" voltaria a dividir a coluna.
 */
export function celula(texto: string): string {
  const limpo = texto.trim().replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  return limpo || "—";
}

function tabela(cabecalho: string[], linhas: string[][]): string {
  return [
    `| ${cabecalho.join(" | ")} |`,
    `|${cabecalho.map(() => "---").join("|")}|`,
    ...linhas.map((l) => `| ${l.map(celula).join(" | ")} |`),
  ].join("\n");
}

function lista(itens: string[]): string {
  return itens.length ? itens.map((i) => `- ${i.trim()}`).join("\n") : NAO_SE_APLICA;
}

function paragrafo(texto: string): string {
  return texto.trim() || "[a preencher]";
}

/** Ordena os casos: feliz → alternativo → negativo → limite → não funcional (ordem estável). */
export function ordenarCasos(casos: Caso[]): Caso[] {
  const rank = (t: TipoCaso) => TIPOS_CASO.indexOf(t);
  return casos
    .map((caso, i) => ({ caso, i }))
    .sort((a, b) => rank(a.caso.tipo) - rank(b.caso.tipo) || a.i - b.i)
    .map(({ caso }) => caso);
}

export function montarMarkdown(issue: Issue): string {
  const partes: string[] = [];

  partes.push(`# ${issue.titulo.trim() || "[a preencher]"}`);
  partes.push(
    tabela(
      ["Campo", "Valor"],
      [
        ["Tipo", issue.tipo],
        ["Produto", issue.produto],
        ["Módulo/Tela", issue.modulo],
        ["Perfis afetados", issue.perfis.join(", ")],
        ["Prioridade", issue.prioridade],
      ],
    ),
  );

  partes.push(`## Problema\n\n${paragrafo(issue.problema)}`);
  partes.push(`## Solução\n\n${paragrafo(issue.solucao)}`);

  partes.push("## Requisito Técnico");
  partes.push(`### 1. Contexto e Objetivo\n\n${paragrafo(issue.contexto)}`);

  partes.push(
    "### 2. Estados / Ciclo de vida\n\n" +
      (issue.estados.length
        ? tabela(
            ["Status", "Significado", "Vai para", "Quem muda"],
            issue.estados.map((e) => [e.status, e.significado, e.vai_para.join(", ") || "— (final)", e.quem_muda]),
          )
        : "_Não se aplica: esta issue não tem status._"),
  );

  let regras =
    "### 3. Regras de Negócio\n\n" +
    (issue.regras.length
      ? tabela(
          ["#", "Regra (condição → resultado)", "Exemplo concreto"],
          issue.regras.map((r) => [r.id, r.regra, r.exemplo]),
        )
      : NAO_SE_APLICA);
  if (issue.fluxo_decisao.trim()) {
    regras += `\n\n**Fluxo de decisão**\n\n\`\`\`text\n${issue.fluxo_decisao.trim()}\n\`\`\``;
  }
  partes.push(regras);

  let interfaceMd =
    "### 4. Interface\n\n" +
    (issue.interface.length
      ? tabela(
          ["Elemento", "Tipo", "Texto exato", "Obrigatório", "Regra"],
          issue.interface.map((i) => [i.elemento, i.tipo, i.texto_exato, i.obrigatorio ? "Sim" : "Não", i.regra]),
        )
      : NAO_SE_APLICA);
  interfaceMd +=
    "\n\n**Mensagens**\n\n" +
    (issue.mensagens.length
      ? tabela(
          ["Tipo", "Texto exato"],
          issue.mensagens.map((m) => [m.tipo, m.texto]),
        )
      : NAO_SE_APLICA);
  partes.push(interfaceMd);

  const e = issue.escopo;
  partes.push(
    "### 5. Escopo e impacto\n\n" +
      [
        `**Telas:** ${e.telas.join(", ") || "—"}`,
        `**Perfis:** ${e.perfis.join(", ") || "—"}`,
        `**Integrações:** ${e.integracoes.join(", ") || "—"}`,
        `**Volume e limites:** ${e.limites.join("; ") || "—"}`,
        `**Desempenho:** ${e.desempenho.trim() || "—"}`,
      ]
        .map((l) => `- ${l}`)
        .join("\n"),
  );

  partes.push(`### 6. Fora de escopo\n\n${lista(issue.fora_de_escopo)}`);

  partes.push(
    "## Critérios de Aceite\n\n" +
      (issue.criterios.length
        ? issue.criterios
            .map((c) => {
              const cobre = c.regras_cobertas.length ? ` _(cobre: ${c.regras_cobertas.join(", ")})_` : "";
              return `- [ ] **${c.id}** ${c.texto.trim()}${cobre}`;
            })
            .join("\n")
        : "[a preencher]"),
  );

  partes.push(
    "## Casos de teste\n\n" +
      (issue.casos.length
        ? tabela(
            ["ID", "CA", "Tipo", "Dado / Quando / Então", "Técnica e item de cobertura"],
            ordenarCasos(issue.casos).map((c) => [
              c.id,
              c.criterio,
              ROTULO_CASO[c.tipo],
              `**Dado** ${c.dado.trim()}\n**Quando** ${c.quando.trim()}\n**Então** ${c.entao.trim()}`,
              `${c.tecnica.trim()} — ${c.item_cobertura.trim()}`,
            ]),
          )
        : "[a preencher]"),
  );

  const r = issue.revisao;
  partes.push(
    "## Revisão da task\n\n" +
      (r.checklist.length ? r.checklist.map((i) => `- [${i.ok ? "x" : " "}] ${i.item.trim()}`).join("\n") : NAO_SE_APLICA) +
      "\n\n### Dúvidas para o PO\n\n" +
      (r.duvidas.length
        ? r.duvidas.map((d, i) => `${i + 1}. > ${d.trecho.trim().replace(/\r?\n/g, " ")}\n\n   ${d.pergunta.trim()}`).join("\n\n")
        : "_Nenhuma dúvida registrada._"),
  );

  return partes.join("\n\n") + "\n";
}
