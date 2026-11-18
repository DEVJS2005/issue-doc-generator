import type { Banco } from "./banco.js";

/** Ações registradas. A tela traduz cada uma (web/src/Auditoria.tsx). */
export const ACOES_AUDITORIA = [
  "login",
  "login_falhou",
  "primeiro_admin",
  "gerar",
  "refinar",
  "status",
  "apagar_issue",
  "criar_link",
  "revogar_link",
  "ajustes",
  "criar_usuario",
  "alterar_usuario",
  "backup",
  "baixar_backup",
  "criar_jira",
] as const;
export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number];

export type Evento = {
  id: number;
  quando: number;
  quem: string;
  acao: AcaoAuditoria;
  alvo: string | null;
  detalhe: Record<string, unknown> | null;
  ip: string | null;
};

export type NovoEvento = Omit<Evento, "id" | "quando"> & { quando?: number };

export type FiltroAuditoria = {
  quem?: string;
  acao?: AcaoAuditoria;
  de?: number;
  ate?: number;
  /** Paginação: só eventos com id menor que este. */
  antesDe?: number;
  limite?: number;
};

type Linha = { id: number; quando: number; quem: string; acao: AcaoAuditoria; alvo: string | null; detalhe: string | null; ip: string | null };

const LIMITE_MAX = 200;

/**
 * Registro de quem fez o quê. Guarda só identificadores e metadados: nunca senha, token, chave de
 * API nem o texto das issues.
 */
export class RepositorioAuditoria {
  constructor(private readonly db: Banco) {}

  registrar(e: NovoEvento): void {
    this.db
      .prepare("INSERT INTO auditoria (quando, quem, acao, alvo, detalhe, ip) VALUES (?, ?, ?, ?, ?, ?)")
      .run(e.quando ?? Date.now(), e.quem, e.acao, e.alvo, e.detalhe ? JSON.stringify(e.detalhe) : null, e.ip);
  }

  /** Eventos mais novos primeiro, com filtros; `proximo` é o cursor da página seguinte. */
  listar(f: FiltroAuditoria = {}): { eventos: Evento[]; proximo: number | null } {
    const onde: string[] = [];
    const args: (string | number)[] = [];
    if (f.quem) {
      onde.push("quem LIKE ? ESCAPE '\\'");
      args.push(`%${f.quem.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    if (f.acao) {
      onde.push("acao = ?");
      args.push(f.acao);
    }
    if (f.de !== undefined) {
      onde.push("quando >= ?");
      args.push(f.de);
    }
    if (f.ate !== undefined) {
      onde.push("quando <= ?");
      args.push(f.ate);
    }
    if (f.antesDe !== undefined) {
      onde.push("id < ?");
      args.push(f.antesDe);
    }
    const limite = Math.min(Math.max(f.limite ?? 50, 1), LIMITE_MAX);
    const sql = `SELECT id, quando, quem, acao, alvo, detalhe, ip FROM auditoria ${onde.length ? `WHERE ${onde.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`;
    const linhas = this.db.prepare(sql).all(...args, limite + 1) as Linha[];
    const pagina = linhas.slice(0, limite);
    return {
      eventos: pagina.map((l) => ({ ...l, detalhe: l.detalhe ? (JSON.parse(l.detalhe) as Record<string, unknown>) : null })),
      proximo: linhas.length > limite ? pagina[pagina.length - 1].id : null,
    };
  }

  /** Apaga os eventos mais velhos que `dias` (mesma retenção do histórico). */
  expurgar(dias: number, agora = Date.now()): number {
    return Number(this.db.prepare("DELETE FROM auditoria WHERE quando < ?").run(agora - dias * 86_400_000).changes);
  }
}
