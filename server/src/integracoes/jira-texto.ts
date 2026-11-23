// Converte o Markdown da issue (o subconjunto que montarMarkdown gera) para a notação de texto do
// Jira (wiki markup), que a API v2 aceita tanto no Jira Cloud quanto no Data Center.

// Marcadores temporários (caracteres de controle que não aparecem no texto da issue).
const NEGRITO = "\u0001";
const ITALICO = "\u0004";
const CODIGO_INI = "\u0002";
const CODIGO_FIM = "\u0003";

/**
 * Escapa o que o Jira interpretaria como formatação: [ ] (links e menções [~usuario]), { } (macros),
 * * _ + ^ ~ (negrito, itálico, sublinhado, sobrescrito, subscrito), ! (imagem), | (tabela), ??
 * (citação) e o "-" de riscado.
 */
function escapar(texto: string) {
  return texto
    .replace(/[[\]{}*^~|!_+]/g, (c) => `\\${c}`)
    .replace(/\?\?/g, "\\?\\?")
    .replace(/(^|\s)-(?=\S)/g, "$1\\-");
}

/** Linha de texto que o Jira leria como título ou citação (h1. … bq.): o ponto vira literal. */
function semBlocoNoInicio(linha: string) {
  return linha.replace(/^(\s*)(h[1-6]|bq)\./, "$1$2\\.");
}

/**
 * Dentro de {noformat} o Jira não lê escape: uma linha com "{noformat}" fecharia o bloco. Um espaço
 * de largura zero depois da chave mantém o texto igual na tela e não fecha o bloco.
 */
function dentroDeBloco(linha: string) {
  return linha.replace(/\{(noformat|code)/gi, "{\u200b$1");
}

/** Negrito, itálico e código em linha; o resto é escapado. */
export function emLinha(md: string): string {
  const codigos: string[] = [];
  let s = md.replace(/`([^`]+)`/g, (_, c: string) => `${CODIGO_INI}${codigos.push(c) - 1}${CODIGO_FIM}`);
  s = s.replace(/\*\*(.+?)\*\*/g, `${NEGRITO}$1${NEGRITO}`);
  // Itálico do Markdown (_texto_, entre espaços ou pontuação); "_" no meio de palavra é escapado.
  s = s.replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s).,;:!?])/g, `$1${ITALICO}$2${ITALICO}`);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = escapar(s);
  s = s.replaceAll(NEGRITO, "*").replaceAll(ITALICO, "_");
  // Linha quebrada dentro de célula de tabela: \\ é a quebra de linha do Jira.
  s = s.replace(/\n/g, " \\\\ ");
  return s.replace(new RegExp(`${CODIGO_INI}(\\d+)${CODIGO_FIM}`, "g"), (_, i: string) => `{{${escapar(codigos[Number(i)])}}}`);
}

/** Divide uma linha de tabela Markdown em células, respeitando o "\|" escapado. */
function celulas(linha: string): string[] {
  const corpo = linha.trim().replace(/^\|/, "").replace(/\|$/, "");
  return corpo.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const SEPARADOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function markdownParaJira(md: string): string {
  const linhas = md.replace(/\r\n/g, "\n").split("\n");
  const saida: string[] = [];
  let emCodigo = false;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    if (/^```/.test(linha.trim())) {
      saida.push("{noformat}");
      emCodigo = !emCodigo;
      continue;
    }
    if (emCodigo) {
      saida.push(dentroDeBloco(linha));
      continue;
    }

    const titulo = linha.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      saida.push(`h${titulo[1].length}. ${emLinha(titulo[2])}`);
      continue;
    }

    if (linha.trim().startsWith("|")) {
      if (SEPARADOR.test(linha.trim())) continue;
      const cabecalho = i + 1 < linhas.length && SEPARADOR.test(linhas[i + 1].trim());
      const cels = celulas(linha).map((c) => emLinha(c) || " ");
      saida.push(cabecalho ? `||${cels.join("||")}||` : `|${cels.join("|")}|`);
      continue;
    }

    const item = linha.match(/^(\s*)[-*]\s+(.*)$/);
    if (item) {
      saida.push(`${"*".repeat(Math.floor(item[1].length / 2) + 1)} ${emLinha(item[2])}`);
      continue;
    }
    const numerado = linha.match(/^(\s*)\d+\.\s+(.*)$/);
    if (numerado) {
      saida.push(`${"#".repeat(Math.floor(numerado[1].length / 2) + 1)} ${emLinha(numerado[2])}`);
      continue;
    }
    const citacao = linha.match(/^>\s?(.*)$/);
    if (citacao) {
      saida.push(`bq. ${emLinha(citacao[1])}`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(linha)) {
      saida.push("----");
      continue;
    }
    saida.push(semBlocoNoInicio(emLinha(linha)));
  }
  if (emCodigo) saida.push("{noformat}");
  return saida.join("\n");
}
