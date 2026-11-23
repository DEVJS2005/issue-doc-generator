// Junta os fragmentos de changelog.d/ no CHANGELOG.md e no docs/ROADMAP.md.
//
// Cada PR cria o próprio arquivo em changelog.d/ em vez de editar o CHANGELOG, o ROADMAP e o
// histórico de decisões. Assim dois PRs nunca mexem nas mesmas linhas, e a branch atualiza sem
// conflito. No release (ou num PR de "consolidar"), este script junta tudo e apaga os fragmentos.
//
// Uso (na raiz):
//   npm run changelog                     junta em "Não lançado"
//   npm run changelog -- --versao 1.3.0   junta e fecha a versão 1.3.0 com a data de hoje
//   npm run changelog -- --conferir       só confere os fragmentos (sai com erro se algum for inválido)
//
// Formato do fragmento (changelog.d/<qualquer-nome>.md): cabeçalho "chave: valor", uma linha "---"
// e o texto em Markdown, que vai como está para a categoria.
//
//   categoria: Segurança
//   pr: 41
//   roadmap: 41
//   decisao: sessões revogáveis guardadas no SQLite, com o hash do id
//   ---
//   - Sessões revogáveis: ...
//
// `categoria` é obrigatória. `pr` e `roadmap` são opcionais: com os dois, a linha do item no
// ROADMAP vira "✅ PR #<pr>". Cada `decisao` vira um item no histórico de decisões, com a data.

import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CATEGORIAS = ["Adicionado", "Alterado", "Descontinuado", "Removido", "Corrigido", "Segurança", "Documentação"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export type Fragmento = {
  nome: string;
  categoria: Categoria;
  pr: number | null;
  roadmap: string | null;
  decisoes: string[];
  texto: string;
};

export class ErroFragmento extends Error {}

const NAO_LANCADO = "## [Não lançado]";

export function lerFragmento(nome: string, conteudo: string): Fragmento {
  const linhas = conteudo.replace(/\r\n/g, "\n").split("\n");
  const fim = linhas.findIndex((l) => l.trim() === "---");
  if (fim < 0) throw new ErroFragmento(`${nome}: falta a linha "---" entre o cabeçalho e o texto.`);
  const campos: Record<string, string[]> = {};
  for (const linha of linhas.slice(0, fim)) {
    if (!linha.trim()) continue;
    const i = linha.indexOf(":");
    if (i < 0) throw new ErroFragmento(`${nome}: linha do cabeçalho sem "chave: valor": ${linha}`);
    const chave = linha.slice(0, i).trim().toLowerCase();
    if (!["categoria", "pr", "roadmap", "decisao"].includes(chave)) throw new ErroFragmento(`${nome}: campo desconhecido "${chave}".`);
    (campos[chave] ??= []).push(linha.slice(i + 1).trim());
  }
  const categoria = campos.categoria?.[0];
  if (!categoria || !(CATEGORIAS as readonly string[]).includes(categoria)) {
    throw new ErroFragmento(`${nome}: categoria inválida. Use uma de: ${CATEGORIAS.join(", ")}.`);
  }
  const pr = campos.pr?.[0] ? Number(campos.pr[0].replace(/^#/, "")) : null;
  if (pr !== null && (!Number.isInteger(pr) || pr <= 0)) throw new ErroFragmento(`${nome}: "pr" deve ser o número do PR.`);
  const roadmap = campos.roadmap?.[0] || null;
  if (roadmap !== null && !/^[0-9]+[a-z]?$/.test(roadmap)) throw new ErroFragmento(`${nome}: "roadmap" deve ser o número do item (ex.: 41 ou 12b).`);
  const texto = linhas.slice(fim + 1).join("\n").trim();
  if (!texto) throw new ErroFragmento(`${nome}: o texto do changelog está vazio.`);
  return { nome, categoria: categoria as Categoria, pr, roadmap, decisoes: campos.decisao ?? [], texto };
}

/** Separa a seção "Não lançado" em categorias, na ordem em que aparecem. */
function lerSecao(corpo: string) {
  const categorias = new Map<string, string>();
  let atual: string | null = null;
  let antes = "";
  for (const linha of corpo.split("\n")) {
    const m = /^### (.+)$/.exec(linha);
    if (m) {
      atual = m[1].trim();
      categorias.set(atual, "");
    } else if (atual) categorias.set(atual, categorias.get(atual) + linha + "\n");
    else antes += linha + "\n";
  }
  return { antes: antes.trim(), categorias };
}

function escreverSecao(antes: string, categorias: Map<string, string>) {
  const ordem = [...categorias.keys()].sort((a, b) => {
    const ia = CATEGORIAS.indexOf(a as Categoria);
    const ib = CATEGORIAS.indexOf(b as Categoria);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const partes = antes ? [antes] : [];
  for (const nome of ordem) {
    const texto = categorias.get(nome)!.trim();
    if (texto) partes.push(`### ${nome}\n\n${texto}`);
  }
  return partes.join("\n\n");
}

export function juntarChangelog(changelog: string, fragmentos: Fragmento[], versao?: { numero: string; data: string }) {
  const inicio = changelog.indexOf(NAO_LANCADO);
  if (inicio < 0) throw new ErroFragmento(`CHANGELOG.md sem a seção "${NAO_LANCADO}".`);
  const depois = changelog.indexOf("\n## [", inicio + NAO_LANCADO.length);
  const fimSecao = depois < 0 ? changelog.length : depois + 1;
  const { antes, categorias } = lerSecao(changelog.slice(inicio + NAO_LANCADO.length, fimSecao));
  // Ordem estável: pelo nome do arquivo.
  for (const f of [...fragmentos].sort((a, b) => a.nome.localeCompare(b.nome))) {
    const atual = (categorias.get(f.categoria) ?? "").trim();
    categorias.set(f.categoria, (atual ? `${atual}\n` : "") + f.texto + "\n");
  }
  const corpo = escreverSecao(antes, categorias);
  let titulo = NAO_LANCADO;
  let resto = changelog.slice(fimSecao);
  if (versao) {
    titulo = `${NAO_LANCADO}\n\n## [${versao.numero}] - ${versao.data}`;
    // Links no fim: "Não lançado" passa a comparar com a versão nova.
    resto = resto.replace(
      /^\[Não lançado\]: (.+)\/compare\/v[^.\s]+\.[^.\s]+\.[^.\s]+\.\.\.HEAD$/m,
      (_l, base: string) => `[Não lançado]: ${base}/compare/v${versao.numero}...HEAD\n[${versao.numero}]: ${base}/releases/tag/v${versao.numero}`,
    );
  }
  return `${changelog.slice(0, inicio)}${titulo}\n\n${corpo}\n\n${resto}`;
}

export function juntarRoadmap(roadmap: string, fragmentos: Fragmento[], dataCurta: string) {
  let texto = roadmap;
  for (const f of fragmentos) {
    if (!f.roadmap || !f.pr) continue;
    const linha = new RegExp(`^(\\| ${f.roadmap} \\|.*\\| )[^|]*(\\|\\s*)$`, "m");
    if (!linha.test(texto)) throw new ErroFragmento(`${f.nome}: o item ${f.roadmap} não está na tabela do ROADMAP.`);
    texto = texto.replace(linha, `$1✅ PR #${f.pr} $2`);
  }
  const decisoes = fragmentos.flatMap((f) => f.decisoes);
  if (decisoes.length) {
    const bloco = `- **${dataCurta}:**\n${decisoes.map((d) => `  - ${d.replace(/[;.]\s*$/, "")};`).join("\n").replace(/;$/, ".")}\n`;
    texto = `${texto.trimEnd()}\n${bloco}`;
  }
  return texto;
}

function principal(argv: string[]) {
  const raiz = fileURLToPath(new URL("../../", import.meta.url));
  const pasta = path.join(raiz, "changelog.d");
  const nomes = readdirSync(pasta).filter((n) => n.endsWith(".md") && n !== "README.md");
  const fragmentos = nomes.map((n) => lerFragmento(n, readFileSync(path.join(pasta, n), "utf8")));
  if (argv.includes("--conferir")) {
    console.warn(`changelog.d: ${fragmentos.length} fragmento(s) válido(s).`);
    return;
  }
  if (!fragmentos.length) {
    console.warn("changelog.d: nenhum fragmento para juntar.");
    if (!argv.includes("--versao")) return;
  }
  const i = argv.indexOf("--versao");
  const numero = i >= 0 ? argv[i + 1] : undefined;
  if (i >= 0 && !/^\d+\.\d+\.\d+$/.test(numero ?? "")) throw new ErroFragmento("Use --versao X.Y.Z.");
  const hoje = new Date();
  const data = hoje.toISOString().slice(0, 10);
  const dataCurta = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const arqChangelog = path.join(raiz, "CHANGELOG.md");
  const arqRoadmap = path.join(raiz, "docs/ROADMAP.md");
  writeFileSync(arqChangelog, juntarChangelog(readFileSync(arqChangelog, "utf8"), fragmentos, numero ? { numero, data } : undefined));
  writeFileSync(arqRoadmap, juntarRoadmap(readFileSync(arqRoadmap, "utf8"), fragmentos, dataCurta));
  for (const n of nomes) rmSync(path.join(pasta, n));
  console.warn(`changelog: ${fragmentos.length} fragmento(s) juntado(s)${numero ? ` na versão ${numero}` : ""}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    principal(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof ErroFragmento ? e.message : e);
    process.exit(1);
  }
}
