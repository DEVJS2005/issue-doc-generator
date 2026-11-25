import type { Banco } from "./banco.js";

/** A partir de quantas falhas seguidas a conta trava. */
export const FALHAS_ANTES_DE_TRAVAR = 10;
/** Primeira espera; cada falha depois de uma trava dobra a espera, até o teto. */
export const PRIMEIRA_ESPERA_MS = 15 * 60_000;
export const ESPERA_MAXIMA_MS = 60 * 60_000;
/** Sem falha por este tempo, a contagem recomeça do zero. */
export const ESQUECER_APOS_MS = 24 * 3_600_000;

type Linha = { conta: string; falhas: number; ultima_falha: number; travada_ate: number };

/** Espera da trava depois de `falhas` falhas seguidas (0 = ainda não trava). */
export function esperaPara(falhas: number): number {
  if (falhas < FALHAS_ANTES_DE_TRAVAR) return 0;
  return Math.min(PRIMEIRA_ESPERA_MS * 2 ** (falhas - FALHAS_ANTES_DE_TRAVAR), ESPERA_MAXIMA_MS);
}

/**
 * Limite de login por conta, com espera progressiva, guardado no banco (não zera ao reiniciar).
 * A conta é o que a pessoa digitou, normalizado: vale também para contas que não existem, para a
 * resposta não revelar quais existem.
 */
export class RepositorioTravasLogin {
  constructor(private readonly db: Banco) {}

  private ler(conta: string, agora: number): Linha | null {
    const l = this.db.prepare("SELECT * FROM travas_login WHERE conta = ?").get(conta) as Linha | undefined;
    if (!l) return null;
    // Muito tempo sem falha e sem trava valendo: recomeça.
    if (l.travada_ate <= agora && agora - l.ultima_falha >= ESQUECER_APOS_MS) return null;
    return l;
  }

  /** Até quando a conta está travada (ms), ou null se pode tentar. */
  travadaAte(conta: string, agora = Date.now()): number | null {
    const l = this.ler(conta, agora);
    return l && l.travada_ate > agora ? l.travada_ate : null;
  }

  /** Registra uma falha. Diz se a conta acabou de travar e até quando. */
  registrarFalha(conta: string, agora = Date.now()): { falhas: number; travadaAte: number | null; travouAgora: boolean } {
    const falhas = (this.ler(conta, agora)?.falhas ?? 0) + 1;
    const espera = esperaPara(falhas);
    const travadaAte = espera ? agora + espera : 0;
    this.db
      .prepare(
        `INSERT INTO travas_login (conta, falhas, ultima_falha, travada_ate) VALUES (?, ?, ?, ?)
         ON CONFLICT (conta) DO UPDATE SET falhas = excluded.falhas, ultima_falha = excluded.ultima_falha, travada_ate = excluded.travada_ate`,
      )
      .run(conta, falhas, agora, travadaAte);
    return { falhas, travadaAte: travadaAte || null, travouAgora: espera > 0 };
  }

  /** Login certo: a contagem da conta recomeça. */
  limpar(conta: string) {
    this.db.prepare("DELETE FROM travas_login WHERE conta = ?").run(conta);
  }

  /** Apaga as contagens esquecidas (sem falha há 24 h e sem trava valendo). */
  expurgar(agora = Date.now()): number {
    return Number(this.db.prepare("DELETE FROM travas_login WHERE travada_ate <= ? AND ultima_falha <= ?").run(agora, agora - ESQUECER_APOS_MS).changes);
  }
}
