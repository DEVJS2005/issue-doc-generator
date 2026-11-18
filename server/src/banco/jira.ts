import type { Banco } from "./banco.js";

export type EnvioJira = { chave: string; url: string; enviadoPor: string; enviadoEm: number };

type Linha = { chave: string; url: string; enviado_por: string; enviado_em: number };

/** Qual issue do histórico já foi criada no Jira (uma vez por issue), para não duplicar. */
export class RepositorioJira {
  constructor(private readonly db: Banco) {}

  obter(issueId: number): EnvioJira | null {
    const l = this.db.prepare("SELECT chave, url, enviado_por, enviado_em FROM jira_envios WHERE issue_id = ?").get(issueId) as Linha | undefined;
    return l ? { chave: l.chave, url: l.url, enviadoPor: l.enviado_por, enviadoEm: l.enviado_em } : null;
  }

  registrar(issueId: number, envio: EnvioJira): void {
    this.db
      .prepare("INSERT INTO jira_envios (issue_id, chave, url, enviado_por, enviado_em) VALUES (?, ?, ?, ?, ?)")
      .run(issueId, envio.chave, envio.url, envio.enviadoPor, envio.enviadoEm);
  }
}
