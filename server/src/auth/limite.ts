/**
 * Limite de uso em janela deslizante, guardado em memória (um processo). Serve para o limite de
 * gerações por usuário por hora e para frear tentativas de login. Reiniciar o servidor zera as
 * contagens; com mais de uma instância, cada uma conta separado.
 */
/** Acima de tantas chaves, as vencidas são descartadas (o Map não cresce sem limite). */
const PODAR_ACIMA_DE = 10_000;

export class Limitador {
  private readonly registros = new Map<string, number[]>();

  constructor(
    private maximo: number,
    private readonly janelaMs: number,
  ) {}

  /** Muda o máximo sem perder as contagens (ex.: limite por hora alterado na administração). */
  definirMaximo(maximo: number) {
    this.maximo = maximo;
  }

  /** Registra uma tentativa se ainda houver cota. */
  tentar(chave: string, agora = Date.now()): { ok: true; restam: number } | { ok: false; liberaEm: number } {
    if (this.registros.size > PODAR_ACIMA_DE) this.podar(agora);
    const recentes = (this.registros.get(chave) ?? []).filter((t) => t > agora - this.janelaMs);
    if (recentes.length >= this.maximo) {
      this.registros.set(chave, recentes);
      return { ok: false, liberaEm: recentes[0] + this.janelaMs };
    }
    recentes.push(agora);
    this.registros.set(chave, recentes);
    return { ok: true, restam: this.maximo - recentes.length };
  }

  /** Devolve uma tentativa (ex.: pedido que falhou antes de chegar à IA). */
  devolver(chave: string) {
    this.registros.get(chave)?.pop();
  }

  limpar(chave: string) {
    this.registros.delete(chave);
  }

  /** Descarta as chaves sem tentativa dentro da janela. */
  podar(agora = Date.now()) {
    for (const [chave, tempos] of this.registros) {
      if (!tempos.some((t) => t > agora - this.janelaMs)) this.registros.delete(chave);
    }
  }

  get tamanho() {
    return this.registros.size;
  }
}
