// PDF da issue pela impressão do navegador ("Salvar como PDF"): sai com as seções formatadas, os
// destaques e o cabeçalho de metadados, sem biblioteca extra. As regras @media print do estilo.css
// escondem o resto da tela.

export type DadosPdf = { produto: string; tipo: string; autor: string; quando: number; versao: number };

/** Linhas do cabeçalho do PDF, na ordem em que aparecem. */
export function metadadosPdf(d: DadosPdf): [string, string][] {
  return [
    ["Produto", d.produto],
    ["Tipo", d.tipo],
    ["Autor", d.autor],
    ["Data", new Date(d.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })],
    ["Versão", String(d.versao)],
  ];
}

/** Nome de arquivo a partir do título (# …) do Markdown: minúsculas, sem acento, com hífens. */
export function nomeArquivo(markdown: string) {
  const titulo = markdown.match(/^# (.+)$/m)?.[1] ?? "issue";
  return (
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "issue"
  );
}

/**
 * Abre a impressão do navegador. O título da página vira o nome sugerido do arquivo PDF e volta ao
 * normal em seguida (window.print() só retorna depois que a janela de impressão fecha).
 */
export function baixarPdf(markdown: string) {
  const anterior = document.title;
  document.title = nomeArquivo(markdown);
  try {
    window.print();
  } finally {
    document.title = anterior;
  }
}
