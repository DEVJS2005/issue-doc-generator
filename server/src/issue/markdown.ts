import type { Idioma } from "../prompt/entrada.js";
import { TIPOS_CASO, type Caso, type Issue, type TipoCaso, TIPOS_ISSUE } from "./schema.js";

// Monta o Markdown final sempre a partir do JSON validado: as seções saem na mesma ordem e
// nenhuma falta. Seção sem conteúdo ganha uma linha "Não se aplica" para manter a numeração.
// Títulos e rótulos saem no idioma da issue; "[a preencher]" fica igual em todos (a tela o destaca).

type TipoIssue = (typeof TIPOS_ISSUE)[number];

type Textos = {
  campo: string;
  valor: string;
  tipo: string;
  produto: string;
  modulo: string;
  perfisAfetados: string;
  prioridade: string;
  problema: string;
  solucao: string;
  requisito: string;
  contexto: string;
  estados: string;
  colunasEstados: [string, string, string, string];
  final: string;
  semStatus: string;
  regras: string;
  colunasRegras: [string, string, string];
  fluxo: string;
  interface: string;
  colunasInterface: [string, string, string, string, string];
  sim: string;
  nao: string;
  mensagens: string;
  colunasMensagens: [string, string];
  escopo: string;
  telas: string;
  perfis: string;
  integracoes: string;
  limites: string;
  desempenho: string;
  foraDeEscopo: string;
  criterios: string;
  cobre: string;
  casos: string;
  colunasCasos: [string, string, string, string, string];
  dado: string;
  quando: string;
  entao: string;
  revisao: string;
  duvidas: string;
  semDuvidas: string;
  naoSeAplica: string;
  tiposCaso: Record<TipoCaso, string>;
  tiposIssue: Record<TipoIssue, string>;
};

const TEXTOS: Record<Idioma, Textos> = {
  "pt-BR": {
    campo: "Campo",
    valor: "Valor",
    tipo: "Tipo",
    produto: "Produto",
    modulo: "Módulo/Tela",
    perfisAfetados: "Perfis afetados",
    prioridade: "Prioridade",
    problema: "Problema",
    solucao: "Solução",
    requisito: "Requisito Técnico",
    contexto: "1. Contexto e Objetivo",
    estados: "2. Estados / Ciclo de vida",
    colunasEstados: ["Status", "Significado", "Vai para", "Quem muda"],
    final: "— (final)",
    semStatus: "_Não se aplica: esta issue não tem status._",
    regras: "3. Regras de Negócio",
    colunasRegras: ["#", "Regra (condição → resultado)", "Exemplo concreto"],
    fluxo: "Fluxo de decisão",
    interface: "4. Interface",
    colunasInterface: ["Elemento", "Tipo", "Texto exato", "Obrigatório", "Regra"],
    sim: "Sim",
    nao: "Não",
    mensagens: "Mensagens",
    colunasMensagens: ["Tipo", "Texto exato"],
    escopo: "5. Escopo e impacto",
    telas: "Telas",
    perfis: "Perfis",
    integracoes: "Integrações",
    limites: "Volume e limites",
    desempenho: "Desempenho",
    foraDeEscopo: "6. Fora de escopo",
    criterios: "Critérios de Aceite",
    cobre: "cobre",
    casos: "Casos de teste",
    colunasCasos: ["ID", "CA", "Tipo", "Dado / Quando / Então", "Técnica e item de cobertura"],
    dado: "Dado",
    quando: "Quando",
    entao: "Então",
    revisao: "Revisão da task",
    duvidas: "Dúvidas para o PO",
    semDuvidas: "_Nenhuma dúvida registrada._",
    naoSeAplica: "_Não se aplica._",
    tiposCaso: { feliz: "Feliz", alternativo: "Alternativo", negativo: "Negativo", limite: "Limite", nao_funcional: "Não funcional" },
    tiposIssue: { Correção: "Correção", "Nova funcionalidade": "Nova funcionalidade", "Ajuste técnico": "Ajuste técnico", Melhoria: "Melhoria" },
  },
  en: {
    campo: "Field",
    valor: "Value",
    tipo: "Type",
    produto: "Product",
    modulo: "Module/Screen",
    perfisAfetados: "Affected roles",
    prioridade: "Priority",
    problema: "Problem",
    solucao: "Solution",
    requisito: "Technical Requirement",
    contexto: "1. Context and Goal",
    estados: "2. States / Lifecycle",
    colunasEstados: ["Status", "Meaning", "Goes to", "Who changes it"],
    final: "— (final)",
    semStatus: "_Not applicable: this issue has no status._",
    regras: "3. Business Rules",
    colunasRegras: ["#", "Rule (condition → result)", "Concrete example"],
    fluxo: "Decision flow",
    interface: "4. Interface",
    colunasInterface: ["Element", "Type", "Exact text", "Required", "Rule"],
    sim: "Yes",
    nao: "No",
    mensagens: "Messages",
    colunasMensagens: ["Type", "Exact text"],
    escopo: "5. Scope and impact",
    telas: "Screens",
    perfis: "Roles",
    integracoes: "Integrations",
    limites: "Volume and limits",
    desempenho: "Performance",
    foraDeEscopo: "6. Out of scope",
    criterios: "Acceptance Criteria",
    cobre: "covers",
    casos: "Test cases",
    colunasCasos: ["ID", "AC", "Type", "Given / When / Then", "Technique and coverage item"],
    dado: "Given",
    quando: "When",
    entao: "Then",
    revisao: "Task review",
    duvidas: "Questions for the PO",
    semDuvidas: "_No questions recorded._",
    naoSeAplica: "_Not applicable._",
    tiposCaso: { feliz: "Happy path", alternativo: "Alternative", negativo: "Negative", limite: "Boundary", nao_funcional: "Non-functional" },
    tiposIssue: { Correção: "Bug fix", "Nova funcionalidade": "New feature", "Ajuste técnico": "Technical task", Melhoria: "Improvement" },
  },
  es: {
    campo: "Campo",
    valor: "Valor",
    tipo: "Tipo",
    produto: "Producto",
    modulo: "Módulo/Pantalla",
    perfisAfetados: "Perfiles afectados",
    prioridade: "Prioridad",
    problema: "Problema",
    solucao: "Solución",
    requisito: "Requisito Técnico",
    contexto: "1. Contexto y Objetivo",
    estados: "2. Estados / Ciclo de vida",
    colunasEstados: ["Estado", "Significado", "Pasa a", "Quién lo cambia"],
    final: "— (final)",
    semStatus: "_No aplica: esta issue no tiene estados._",
    regras: "3. Reglas de Negocio",
    colunasRegras: ["#", "Regla (condición → resultado)", "Ejemplo concreto"],
    fluxo: "Flujo de decisión",
    interface: "4. Interfaz",
    colunasInterface: ["Elemento", "Tipo", "Texto exacto", "Obligatorio", "Regla"],
    sim: "Sí",
    nao: "No",
    mensagens: "Mensajes",
    colunasMensagens: ["Tipo", "Texto exacto"],
    escopo: "5. Alcance e impacto",
    telas: "Pantallas",
    perfis: "Perfiles",
    integracoes: "Integraciones",
    limites: "Volumen y límites",
    desempenho: "Rendimiento",
    foraDeEscopo: "6. Fuera de alcance",
    criterios: "Criterios de aceptación",
    cobre: "cubre",
    casos: "Casos de prueba",
    colunasCasos: ["ID", "CA", "Tipo", "Dado / Cuando / Entonces", "Técnica e ítem de cobertura"],
    dado: "Dado",
    quando: "Cuando",
    entao: "Entonces",
    revisao: "Revisión de la tarea",
    duvidas: "Dudas para el PO",
    semDuvidas: "_No se registraron dudas._",
    naoSeAplica: "_No aplica._",
    tiposCaso: { feliz: "Feliz", alternativo: "Alternativo", negativo: "Negativo", limite: "Límite", nao_funcional: "No funcional" },
    tiposIssue: { Correção: "Corrección", "Nova funcionalidade": "Nueva funcionalidad", "Ajuste técnico": "Ajuste técnico", Melhoria: "Mejora" },
  },
};

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

function lista(itens: string[], naoSeAplica: string): string {
  return itens.length ? itens.map((i) => `- ${i.trim()}`).join("\n") : naoSeAplica;
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

export function montarMarkdown(issue: Issue, idioma: Idioma = "pt-BR"): string {
  const t = TEXTOS[idioma];
  const partes: string[] = [];

  partes.push(`# ${issue.titulo.trim() || "[a preencher]"}`);
  partes.push(
    tabela(
      [t.campo, t.valor],
      [
        [t.tipo, t.tiposIssue[issue.tipo] ?? issue.tipo],
        [t.produto, issue.produto],
        [t.modulo, issue.modulo],
        [t.perfisAfetados, issue.perfis.join(", ")],
        [t.prioridade, issue.prioridade],
      ],
    ),
  );

  partes.push(`## ${t.problema}\n\n${paragrafo(issue.problema)}`);
  partes.push(`## ${t.solucao}\n\n${paragrafo(issue.solucao)}`);

  partes.push(`## ${t.requisito}`);
  partes.push(`### ${t.contexto}\n\n${paragrafo(issue.contexto)}`);

  partes.push(
    `### ${t.estados}\n\n` +
      (issue.estados.length
        ? tabela(
            t.colunasEstados,
            issue.estados.map((e) => [e.status, e.significado, e.vai_para.join(", ") || t.final, e.quem_muda]),
          )
        : t.semStatus),
  );

  let regras =
    `### ${t.regras}\n\n` +
    (issue.regras.length ? tabela(t.colunasRegras, issue.regras.map((r) => [r.id, r.regra, r.exemplo])) : t.naoSeAplica);
  if (issue.fluxo_decisao.trim()) {
    regras += `\n\n**${t.fluxo}**\n\n\`\`\`text\n${issue.fluxo_decisao.trim()}\n\`\`\``;
  }
  partes.push(regras);

  let interfaceMd =
    `### ${t.interface}\n\n` +
    (issue.interface.length
      ? tabela(
          t.colunasInterface,
          issue.interface.map((i) => [i.elemento, i.tipo, i.texto_exato, i.obrigatorio ? t.sim : t.nao, i.regra]),
        )
      : t.naoSeAplica);
  interfaceMd +=
    `\n\n**${t.mensagens}**\n\n` +
    (issue.mensagens.length ? tabela(t.colunasMensagens, issue.mensagens.map((m) => [m.tipo, m.texto])) : t.naoSeAplica);
  partes.push(interfaceMd);

  const e = issue.escopo;
  partes.push(
    `### ${t.escopo}\n\n` +
      [
        `**${t.telas}:** ${e.telas.join(", ") || "—"}`,
        `**${t.perfis}:** ${e.perfis.join(", ") || "—"}`,
        `**${t.integracoes}:** ${e.integracoes.join(", ") || "—"}`,
        `**${t.limites}:** ${e.limites.join("; ") || "—"}`,
        `**${t.desempenho}:** ${e.desempenho.trim() || "—"}`,
      ]
        .map((l) => `- ${l}`)
        .join("\n"),
  );

  partes.push(`### ${t.foraDeEscopo}\n\n${lista(issue.fora_de_escopo, t.naoSeAplica)}`);

  partes.push(
    `## ${t.criterios}\n\n` +
      (issue.criterios.length
        ? issue.criterios
            .map((c) => {
              const cobre = c.regras_cobertas.length ? ` _(${t.cobre}: ${c.regras_cobertas.join(", ")})_` : "";
              return `- [ ] **${c.id}** ${c.texto.trim()}${cobre}`;
            })
            .join("\n")
        : "[a preencher]"),
  );

  partes.push(
    `## ${t.casos}\n\n` +
      (issue.casos.length
        ? tabela(
            t.colunasCasos,
            ordenarCasos(issue.casos).map((c) => [
              c.id,
              c.criterio,
              t.tiposCaso[c.tipo],
              `**${t.dado}** ${c.dado.trim()}\n**${t.quando}** ${c.quando.trim()}\n**${t.entao}** ${c.entao.trim()}`,
              `${c.tecnica.trim()} — ${c.item_cobertura.trim()}`,
            ]),
          )
        : "[a preencher]"),
  );

  const r = issue.revisao;
  partes.push(
    `## ${t.revisao}\n\n` +
      (r.checklist.length ? r.checklist.map((i) => `- [${i.ok ? "x" : " "}] ${i.item.trim()}`).join("\n") : t.naoSeAplica) +
      `\n\n### ${t.duvidas}\n\n` +
      (r.duvidas.length
        ? r.duvidas.map((d, i) => `${i + 1}. > ${d.trecho.trim().replace(/\r?\n/g, " ")}\n\n   ${d.pergunta.trim()}`).join("\n\n")
        : t.semDuvidas),
  );

  return partes.join("\n\n") + "\n";
}
