import type { Banco } from "./banco.js";

export type Alteracao = { quando: number; quem: string; chave: string; de: unknown; para: unknown };

/** Configuração editável pela tela de administração, com o registro de quem mudou o quê. */
export class RepositorioConfiguracao {
  constructor(private readonly db: Banco) {}

  ler(): Record<string, unknown> {
    const linhas = this.db.prepare("SELECT chave, valor FROM configuracao").all() as { chave: string; valor: string }[];
    return Object.fromEntries(linhas.map((l) => [l.chave, JSON.parse(l.valor)]));
  }

  /** Grava só o que mudou e registra cada mudança. Devolve as chaves alteradas. */
  gravar(novos: Record<string, unknown>, anteriores: Record<string, unknown>, quem: string, agora = Date.now()): string[] {
    const mudou = Object.keys(novos).filter((k) => JSON.stringify(novos[k]) !== JSON.stringify(anteriores[k]));
    if (!mudou.length) return [];
    const gravar = this.db.prepare(
      `INSERT INTO configuracao (chave, valor, atualizado_em, atualizado_por) VALUES (?, ?, ?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
    );
    const registrar = this.db.prepare("INSERT INTO alteracoes_configuracao (quando, quem, chave, de, para) VALUES (?, ?, ?, ?, ?)");
    this.db.exec("BEGIN");
    try {
      for (const k of mudou) {
        gravar.run(k, JSON.stringify(novos[k]), agora, quem);
        registrar.run(agora, quem, k, JSON.stringify(anteriores[k] ?? null), JSON.stringify(novos[k]));
      }
      this.db.exec("COMMIT");
    } catch (erro) {
      this.db.exec("ROLLBACK");
      throw erro;
    }
    return mudou;
  }

  alteracoes(limite = 30): Alteracao[] {
    const linhas = this.db
      .prepare("SELECT quando, quem, chave, de, para FROM alteracoes_configuracao ORDER BY id DESC LIMIT ?")
      .all(limite) as { quando: number; quem: string; chave: string; de: string | null; para: string }[];
    return linhas.map((l) => ({ ...l, de: l.de === null ? null : JSON.parse(l.de), para: JSON.parse(l.para) }));
  }
}
