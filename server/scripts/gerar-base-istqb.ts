// Gera server/prompts/istqb-base.md a partir do submódulo docs/istqb-ai-ready.
// Uso: npm run prompt:istqb --workspace server
//
// Leva para o prompt só o que o repositório publica sob licença própria (CC BY-NC 4.0):
// o título e o "Summary (ours)" de cada seção, mais o guia de técnicas caixa-preta.
// Não copia o texto do syllabus (syllabus-text/ fica fora do git, por direito autoral do ISTQB).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raizBase = fileURLToPath(new URL("../../docs/istqb-ai-ready/", import.meta.url));
const destino = fileURLToPath(new URL("../prompts/istqb-base.md", import.meta.url));

const SECOES: Record<string, string[]> = {
  "03-static-testing": [
    "3.2-feedback-and-review-process",
    "3.2.1-benefits-of-early-and-frequent-stakeholder-feedback",
    "3.2.2-review-process-activities",
    "3.2.5-success-factors-for-reviews",
  ],
  "04-test-analysis-and-design": [
    "4.1-test-techniques-overview",
    "4.2-black-box-test-techniques",
    "4.2.1-equivalence-partitioning",
    "4.2.2-boundary-value-analysis",
    "4.2.3-decision-table-testing",
    "4.2.4-state-transition-testing",
    "4.4-experience-based-test-techniques",
    "4.4.1-error-guessing",
    "4.4.3-checklist-based-testing",
    "4.5-collaboration-based-test-approaches",
    "4.5.1-collaborative-user-story-writing",
    "4.5.2-acceptance-criteria",
    "4.5.3-acceptance-test-driven-development-atdd",
  ],
};

function semFrontmatter(md: string): { meta: Record<string, string>; corpo: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, corpo: md };
  const meta: Record<string, string> = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const kv = linha.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, corpo: m[2] };
}

function resumo(corpo: string): string {
  const m = corpo.match(/## Summary \(ours\)\s*\r?\n([\s\S]*?)(?=\r?\n## |$)/);
  if (!m) throw new Error("Seção sem 'Summary (ours)'.");
  return m[1].trim();
}

const partes: string[] = [
  "# Base de conhecimento ISTQB (CTFL v4.0.1)",
  "Fonte: istqb-ai-ready (https://github.com/DEVJS2005/istqb-ai-ready), conteúdo CC BY-NC 4.0.",
  "Os resumos são dos mantenedores do istqb-ai-ready, não texto do ISTQB. Derivado do ISTQB® Certified Tester Foundation Level Syllabus v4.0.1, © 2024 ISTQB®.",
  "Ao citar, use a forma \"(ISTQB CTFL v4.0.1, 4.2.2)\" e os termos do glossário oficial; em português, mostre o termo original na primeira menção.",
  "## Resumo das seções",
];

for (const [capitulo, arquivos] of Object.entries(SECOES)) {
  for (const arquivo of arquivos) {
    const md = readFileSync(path.join(raizBase, "syllabus", capitulo, `${arquivo}.md`), "utf8");
    const { meta, corpo } = semFrontmatter(md);
    partes.push(`### ${meta.section} ${meta.title}\n\n${resumo(corpo)}`);
  }
}

const guia = semFrontmatter(readFileSync(path.join(raizBase, "guides", "black-box-techniques.md"), "utf8")).corpo;
partes.push("## Guia prático (istqb-ai-ready: guides/black-box-techniques.md)");
partes.push(guia.trim().replace(/^# .*\r?\n/, "").trim());

writeFileSync(destino, partes.join("\n\n").replace(/\r\n/g, "\n") + "\n", "utf8");
console.log(`Gerado ${path.relative(process.cwd(), destino)}`);
