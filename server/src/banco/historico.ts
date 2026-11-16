import type { Issue } from "../issue/schema.js";
import type { Entrada } from "../prompt/entrada.js";
import type { Banco } from "./banco.js";

export type ResumoIssue = {
  id: number;
  usuario: string;
  titulo: string;
  tipo: string;
  produto: string;
  criadaEm: number;
  atualizadaEm: number;
  versoes: number;
  modelo: string;
};

export type IssueGuardada = ResumoIssue & { entrada: Entrada; issue: Issue; markdown: string };
export type Versao = { numero: number; quando: number; ajuste: string | null; modelo: string };

type Linha = {
  id: number;
  usuario: string;
  titulo: string;
  tipo: string;
  produto: string;
  criada_em: number;
  atualizada_em: number;
  versoes: number;
  modelo: string;
  entrada_json?: string;
  issue_json?: string;
  markdown?: string;
};

const RESUMO = "id, usuario, titulo, tipo, produto, criada_em, atualizada_em, versoes, modelo";

function paraResumo(l: Linha): ResumoIssue {
  return {
    id: l.id,
    usuario: l.usuario,
    titulo: l.titulo,
    tipo: l.tipo,
    produto: l.produto,
    criadaEm: l.criada_em,
    atualizadaEm: l.atualizada_em,
    versoes: l.versoes,
    modelo: l.modelo,
  };
}

/** Histórico de issues: a versão atual em `issues` e cada geração ou refinamento em `issue_versoes`. */
export class RepositorioHistorico {
  constructor(private readonly db: Banco) {}

  salvarNova(usuario: string, entrada: Entrada, issue: Issue, markdown: string, modelo: string, agora = Date.now()): number {
    const r = this.db
      .prepare(
        `INSERT INTO issues (usuario, criada_em, atualizada_em, titulo, tipo, produto, entrada_json, issue_json, markdown, modelo, versoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(usuario, agora, agora, issue.titulo, entrada.tipo, entrada.produto, JSON.stringify(entrada), JSON.stringify(issue), markdown, modelo);
    const id = Number(r.lastInsertRowid);
    this.db
      .prepare("INSERT INTO issue_versoes (issue_id, numero, quando, ajuste, issue_json, markdown, modelo) VALUES (?, 1, ?, NULL, ?, ?, ?)")
      .run(id, agora, JSON.stringify(issue), markdown, modelo);
    return id;
  }

  salvarRefinamento(id: number, ajuste: string, issue: Issue, markdown: string, modelo: string, agora = Date.now()) {
    const atual = this.db.prepare("SELECT versoes FROM issues WHERE id = ?").get(id) as { versoes: number } | undefined;
    if (!atual) return;
    const numero = atual.versoes + 1;
    this.db
      .prepare("UPDATE issues SET atualizada_em = ?, titulo = ?, issue_json = ?, markdown = ?, modelo = ?, versoes = ? WHERE id = ?")
      .run(agora, issue.titulo, JSON.stringify(issue), markdown, modelo, numero, id);
    this.db
      .prepare("INSERT INTO issue_versoes (issue_id, numero, quando, ajuste, issue_json, markdown, modelo) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, numero, agora, ajuste, JSON.stringify(issue), markdown, modelo);
  }

  /** Mais recentes primeiro. Sem `usuario`, lista de todos (só para admin). */
  listar(filtro: { usuario?: string; limite?: number } = {}): ResumoIssue[] {
    const limite = Math.min(filtro.limite ?? 100, 500);
    const linhas = filtro.usuario
      ? this.db.prepare(`SELECT ${RESUMO} FROM issues WHERE usuario = ? ORDER BY atualizada_em DESC LIMIT ?`).all(filtro.usuario, limite)
      : this.db.prepare(`SELECT ${RESUMO} FROM issues ORDER BY atualizada_em DESC LIMIT ?`).all(limite);
    return (linhas as Linha[]).map(paraResumo);
  }

  obter(id: number): IssueGuardada | null {
    const l = this.db.prepare("SELECT * FROM issues WHERE id = ?").get(id) as Linha | undefined;
    if (!l) return null;
    return { ...paraResumo(l), entrada: JSON.parse(l.entrada_json!), issue: JSON.parse(l.issue_json!), markdown: l.markdown! };
  }

  dono(id: number): string | null {
    const l = this.db.prepare("SELECT usuario FROM issues WHERE id = ?").get(id) as { usuario: string } | undefined;
    return l?.usuario ?? null;
  }

  versoes(id: number): Versao[] {
    return this.db
      .prepare("SELECT numero, quando, ajuste, modelo FROM issue_versoes WHERE issue_id = ? ORDER BY numero")
      .all(id) as Versao[];
  }

  apagar(id: number): boolean {
    return Number(this.db.prepare("DELETE FROM issues WHERE id = ?").run(id).changes) > 0;
  }

  /** Apaga as issues sem atividade há mais de `dias`. Devolve quantas apagou. */
  expurgar(dias: number, agora = Date.now()): number {
    const limite = agora - dias * 86_400_000;
    return Number(this.db.prepare("DELETE FROM issues WHERE atualizada_em < ?").run(limite).changes);
  }
}
