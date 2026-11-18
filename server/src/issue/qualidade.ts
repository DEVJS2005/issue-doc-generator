import type { Issue } from "./schema.js";

// Nota de qualidade da issue: checagens determinísticas (sem chamar a IA de novo) inspiradas no
// INVEST e nas técnicas do ISTQB CTFL v4.0.1. Não bloqueia nada: orienta quem revisa antes de mandar
// ao time. Cada item que falha traz a sugestão do que fazer.

export type ItemQualidade = { texto: string; ok: boolean; sugestao: string | null };
export type GrupoQualidade = { id: string; titulo: string; nota: number; itens: ItemQualidade[] };
export type NivelQualidade = "pronta" | "quase" | "revisar";
export type Qualidade = { nota: number; nivel: NivelQualidade; grupos: GrupoQualidade[] };

const LACUNA = /\[a preencher\]/i;
// Termos vagos que não dão para testar (português, inglês e espanhol, as línguas da geração).
const VAGOS = [
  "rápido", "rapidamente", "fácil", "facilmente", "intuitivo", "intuitiva", "amigável", "adequado", "adequada", "adequadamente",
  "eficiente", "eficientemente", "agradável", "se possível", "quando necessário", "etc",
  "fast", "quickly", "easy", "easily", "intuitive", "user-friendly", "appropriate", "appropriately", "efficient", "if possible",
  "fácilmente", "adecuado", "adecuada", "si es posible",
];
const REGEX_VAGO = new RegExp(`(?<![\\p{L}])(${VAGOS.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}])`, "iu");
const SECAO_ISTQB = /\b\d\.\d(?:\.\d)?\b/;
const NUMERO = /\d/;
// Os exemplos de referência do time têm até ~12 critérios; acima disso, vale dividir a issue.
const MAX_CRITERIOS = 12;

const cheio = (s: string, min = 1) => s.trim().length >= min && !LACUNA.test(s);
const item = (ok: boolean, texto: string, sugestao: string): ItemQualidade => ({ texto, ok, sugestao: ok ? null : sugestao });
const lista = (ids: string[]) => (ids.length > 4 ? `${ids.slice(0, 4).join(", ")} e mais ${ids.length - 4}` : ids.join(", "));

function grupo(id: string, titulo: string, itens: ItemQualidade[]): GrupoQualidade {
  const nota = itens.length ? Math.round((100 * itens.filter((i) => i.ok).length) / itens.length) : 100;
  return { id, titulo, nota, itens };
}

export function avaliarQualidade(issue: Issue): Qualidade {
  const criteriosSemFeliz = issue.criterios.filter((c) => !issue.casos.some((k) => k.criterio === c.id && k.tipo === "feliz")).map((c) => c.id);
  const cobertas = new Set(issue.criterios.flatMap((c) => c.regras_cobertas));
  const regrasSemCriterio = issue.regras.filter((r) => !cobertas.has(r.id)).map((r) => r.id);
  const criteriosVagos = issue.criterios.filter((c) => REGEX_VAGO.test(c.texto)).map((c) => c.id);
  const casosIncompletos = issue.casos.filter((k) => !cheio(k.dado) || !cheio(k.quando) || !cheio(k.entao)).map((k) => k.id);
  const casosSemSecao = issue.casos.filter((k) => !SECAO_ISTQB.test(k.tecnica)).map((k) => k.id);
  const regrasSemExemplo = issue.regras.filter((r) => !cheio(r.exemplo)).map((r) => r.id);
  const tecnicas = new Set(issue.casos.map((k) => k.tecnica.replace(/\(.*\)/, "").trim().toLowerCase()).filter(Boolean));
  const tipos = new Set(issue.casos.map((k) => k.tipo));
  const regrasComNumero = issue.regras.some((r) => NUMERO.test(r.regra));
  const temLacuna = LACUNA.test(JSON.stringify(issue));
  const checklistFalhos = issue.revisao.checklist.filter((c) => !c.ok).map((c) => c.item);

  const grupos = [
    grupo("valor", "Valor e clareza (INVEST: valiosa, negociável)", [
      item(cheio(issue.problema, 60), "O problema está descrito com contexto", "Detalhe o problema: quem é afetado, onde acontece e o impacto."),
      item(cheio(issue.solucao, 60), "A solução diz o que muda", "Descreva a solução esperada, sem entrar em como implementar."),
      item(issue.perfis.length > 0, "Diz quais perfis de usuário são afetados", "Informe os perfis (ex.: cliente, atendente, admin)."),
      item(!LACUNA.test(`${issue.titulo} ${issue.problema} ${issue.solucao}`), "Título, problema e solução sem [a preencher]", "Complete o título, o problema e a solução antes de enviar."),
    ]),
    grupo("escopo", "Escopo e tamanho (INVEST: independente, estimável, pequena)", [
      item(issue.fora_de_escopo.length > 0, "Diz o que fica fora do escopo", "Liste o que não será feito, para evitar discussões na entrega."),
      item(issue.escopo.telas.length > 0 || cheio(issue.modulo), "Aponta telas ou módulo afetados", "Informe as telas ou o módulo afetado."),
      item(issue.regras.length > 0, "Tem regras de negócio", "Escreva ao menos uma regra no formato condição → resultado."),
      item(regrasSemExemplo.length === 0, "Toda regra tem exemplo concreto", `Dê um exemplo com dados fictícios para ${lista(regrasSemExemplo)}.`),
      item(
        issue.criterios.length >= 1 && issue.criterios.length <= MAX_CRITERIOS,
        `Tamanho que cabe numa entrega (1 a ${MAX_CRITERIOS} critérios)`,
        issue.criterios.length > MAX_CRITERIOS ? "Muitos critérios: considere dividir em mais de uma issue." : "Escreva os critérios de aceite.",
      ),
    ]),
    grupo("criterios", "Critérios de aceite (INVEST: testável)", [
      item(criteriosVagos.length === 0, "Critérios sem termos vagos", `Troque termos vagos (rápido, fácil, adequado…) por valores medíveis em ${lista(criteriosVagos)}.`),
      item(criteriosSemFeliz.length === 0, "Todo critério tem caso de teste feliz", `Crie o caso feliz de ${lista(criteriosSemFeliz)}.`),
      item(regrasSemCriterio.length === 0, "Toda regra é coberta por um critério", `Cubra ${lista(regrasSemCriterio)} com algum critério de aceite.`),
    ]),
    grupo("casos", "Casos de teste (ISTQB CTFL v4.0.1)", [
      item(
        issue.casos.length > 0 && casosIncompletos.length === 0,
        "Casos com Dado, Quando e Então preenchidos",
        issue.casos.length ? `Complete Dado/Quando/Então em ${lista(casosIncompletos)}.` : "Escreva os casos de teste.",
      ),
      item(tipos.has("negativo") || tipos.has("limite"), "Tem caso negativo ou de valor limite", "Inclua ao menos um caso negativo ou de valor limite (4.2.1, 4.2.2)."),
      item(!regrasComNumero || tipos.has("limite"), "Regras com números têm caso de valor limite", "As regras têm números: teste o limite e o valor logo acima e abaixo (4.2.2)."),
      item(issue.casos.length < 3 || tecnicas.size >= 2, "Usa mais de uma técnica de teste", "Varie as técnicas (partição, valor limite, tabela de decisão, transição de estados)."),
      item(
        issue.casos.length > 0 && casosSemSecao.length === 0,
        "Cada caso cita a técnica com a seção do ISTQB",
        `Cite a seção do ISTQB na técnica de ${lista(casosSemSecao)} (ex.: "Valor limite (4.2.2)").`,
      ),
    ]),
    grupo("revisao", "Revisão (ISTQB 3.2)", [
      item(checklistFalhos.length === 0, "Checklist de revisão sem pendências", `Resolva os itens do checklist: ${lista(checklistFalhos)}.`),
      item(!temLacuna || issue.revisao.duvidas.length > 0, "Cada [a preencher] vira pergunta para o PO", "Há lacunas sem pergunta: liste as dúvidas para o PO."),
    ]),
  ];

  const itens = grupos.flatMap((g) => g.itens);
  const nota = Math.round((100 * itens.filter((i) => i.ok).length) / itens.length);
  const nivel: NivelQualidade = nota >= 85 ? "pronta" : nota >= 65 ? "quase" : "revisar";
  return { nota, nivel, grupos };
}
