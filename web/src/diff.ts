export type LinhaDiff = { tipo: "igual" | "adicionada" | "removida"; texto: string };

// Acima disso (linhas × linhas) a tabela do LCS fica pesada para o navegador: mostra tudo como
// removido e adicionado, o que ainda é correto, só menos fino.
const LIMITE_CELULAS = 4_000_000;

/** Diferença linha a linha entre dois textos (maior subsequência comum). */
export function diffLinhas(antes: string, depois: string): LinhaDiff[] {
  const a = antes.split("\n");
  const b = depois.split("\n");
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > LIMITE_CELULAS) {
    return [...a.map((texto) => ({ tipo: "removida" as const, texto })), ...b.map((texto) => ({ tipo: "adicionada" as const, texto }))];
  }

  // lcs[i][j] = tamanho da maior subsequência comum de a[i..] e b[j..]
  const largura = m + 1;
  const lcs = new Uint32Array((n + 1) * largura);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * largura + j] = a[i] === b[j] ? lcs[(i + 1) * largura + j + 1] + 1 : Math.max(lcs[(i + 1) * largura + j], lcs[i * largura + j + 1]);
    }
  }

  const saida: LinhaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      saida.push({ tipo: "igual", texto: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * largura + j] >= lcs[i * largura + j + 1]) {
      saida.push({ tipo: "removida", texto: a[i++] });
    } else {
      saida.push({ tipo: "adicionada", texto: b[j++] });
    }
  }
  while (i < n) saida.push({ tipo: "removida", texto: a[i++] });
  while (j < m) saida.push({ tipo: "adicionada", texto: b[j++] });
  return saida;
}
