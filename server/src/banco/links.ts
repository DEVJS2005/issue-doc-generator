import { createHash, randomBytes } from "node:crypto";
import type { Banco } from "./banco.js";

export const DIAS_LINK = [1, 7, 30] as const;
const DIA_MS = 86_400_000;

export type Link = { id: number; criadoPor: string; criadoEm: number; expiraEm: number };

type Linha = { id: number; criado_por: string; criado_em: number; expira_em: number };

/** O banco guarda só o hash do token: quem tiver uma cópia do banco não consegue abrir os links. */
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const paraLink = (l: Linha): Link => ({ id: l.id, criadoPor: l.criado_por, criadoEm: l.criado_em, expiraEm: l.expira_em });

/** Links só de leitura para quem não tem login, com validade e revogação. */
export class RepositorioLinks {
  constructor(private readonly db: Banco) {}

  /** Cria um link e devolve o token (a única vez em que ele aparece). */
  criar(issueId: number, criadoPor: string, dias: number, agora = Date.now()): { token: string; link: Link } {
    const token = randomBytes(24).toString("base64url");
    const expiraEm = agora + dias * DIA_MS;
    const r = this.db
      .prepare("INSERT INTO links (issue_id, token_hash, criado_por, criado_em, expira_em) VALUES (?, ?, ?, ?, ?)")
      .run(issueId, hash(token), criadoPor, agora, expiraEm);
    return { token, link: { id: Number(r.lastInsertRowid), criadoPor, criadoEm: agora, expiraEm } };
  }

  /** Links ainda válidos de uma issue (sem os vencidos e os revogados). */
  listar(issueId: number, agora = Date.now()): Link[] {
    const linhas = this.db
      .prepare(
        "SELECT id, criado_por, criado_em, expira_em FROM links WHERE issue_id = ? AND revogado_em IS NULL AND expira_em > ? ORDER BY id DESC",
      )
      .all(issueId, agora) as Linha[];
    return linhas.map(paraLink);
  }

  revogar(issueId: number, linkId: number, agora = Date.now()): boolean {
    const r = this.db.prepare("UPDATE links SET revogado_em = ? WHERE id = ? AND issue_id = ? AND revogado_em IS NULL").run(agora, linkId, issueId);
    return Number(r.changes) > 0;
  }

  /** Issue do token, se o link existe, não venceu e não foi revogado. */
  abrir(token: string, agora = Date.now()): number | null {
    const l = this.db
      .prepare("SELECT issue_id FROM links WHERE token_hash = ? AND revogado_em IS NULL AND expira_em > ?")
      .get(hash(token), agora) as { issue_id: number } | undefined;
    return l?.issue_id ?? null;
  }
}
