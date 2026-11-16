import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Um arquivo SQLite (node:sqlite, sem dependência nativa) guarda a configuração da IA, os usuários
// e o histórico de issues. Cada item da lista é uma migração; a versão aplicada fica em
// PRAGMA user_version. Nunca edite uma migração já publicada: acrescente outra no fim.
const MIGRACOES: string[] = [
  `
  CREATE TABLE configuracao (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    atualizado_em INTEGER NOT NULL,
    atualizado_por TEXT NOT NULL
  );
  CREATE TABLE alteracoes_configuracao (
    id INTEGER PRIMARY KEY,
    quando INTEGER NOT NULL,
    quem TEXT NOT NULL,
    chave TEXT NOT NULL,
    de TEXT,
    para TEXT NOT NULL
  );
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash TEXT NOT NULL,
    admin INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em INTEGER NOT NULL,
    atualizado_em INTEGER NOT NULL
  );
  CREATE TABLE issues (
    id INTEGER PRIMARY KEY,
    usuario TEXT NOT NULL,
    criada_em INTEGER NOT NULL,
    atualizada_em INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    tipo TEXT NOT NULL,
    produto TEXT NOT NULL,
    entrada_json TEXT NOT NULL,
    issue_json TEXT NOT NULL,
    markdown TEXT NOT NULL,
    modelo TEXT NOT NULL,
    versoes INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX issues_por_usuario ON issues (usuario, atualizada_em DESC);
  CREATE INDEX issues_por_data ON issues (atualizada_em);
  CREATE TABLE issue_versoes (
    id INTEGER PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    quando INTEGER NOT NULL,
    ajuste TEXT,
    issue_json TEXT NOT NULL,
    markdown TEXT NOT NULL,
    modelo TEXT NOT NULL
  );
  `,
];

export type Banco = DatabaseSync;

export function abrirBanco(arquivo: string): Banco {
  if (arquivo !== ":memory:") mkdirSync(path.dirname(path.resolve(arquivo)), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const { user_version: versao } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = versao; v < MIGRACOES.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRACOES[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (erro) {
      db.exec("ROLLBACK");
      throw erro;
    }
  }
  return db;
}

/** Erro de validação com mensagem pronta para a tela. */
export class ErroValidacao extends Error {
  constructor(
    mensagem: string,
    readonly codigo = "entrada_invalida",
  ) {
    super(mensagem);
    this.name = "ErroValidacao";
  }
}
