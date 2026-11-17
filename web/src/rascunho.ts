import type { Entrada } from "./api";

// Rascunho automático: o que a pessoa digita no formulário fica guardado neste navegador, por
// pessoa, até a issue ser gerada. Nada se perde ao recarregar a página ou quando a sessão expira.
// Se o armazenamento estiver bloqueado (janela anônima, por exemplo), segue sem rascunho.

const chave = (pessoa: string) => `idg:rascunho:${pessoa}`;

const temTexto = (e: Entrada) => Boolean(e.descricao.trim() || e.contexto.trim());

export function lerRascunho(pessoa: string): Entrada | null {
  try {
    const bruto = localStorage.getItem(chave(pessoa));
    if (!bruto) return null;
    const r = JSON.parse(bruto) as Partial<Entrada>;
    const entrada: Entrada = {
      descricao: String(r.descricao ?? ""),
      tipo: String(r.tipo ?? ""),
      produto: String(r.produto ?? ""),
      contexto: String(r.contexto ?? ""),
    };
    return temTexto(entrada) ? entrada : null;
  } catch {
    return null;
  }
}

/** Guarda o rascunho; sem descrição nem contexto, apaga (não há o que salvar). */
export function salvarRascunho(pessoa: string, entrada: Entrada) {
  try {
    if (temTexto(entrada)) localStorage.setItem(chave(pessoa), JSON.stringify(entrada));
    else localStorage.removeItem(chave(pessoa));
  } catch {
    // sem armazenamento: segue sem rascunho
  }
}

export function limparRascunho(pessoa: string) {
  try {
    localStorage.removeItem(chave(pessoa));
  } catch {
    // sem armazenamento: nada a apagar
  }
}
