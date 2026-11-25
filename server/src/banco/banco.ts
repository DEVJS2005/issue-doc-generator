import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Migração 2: nome de usuário para o login (o e-mail continua sendo a identidade e o que o SSO
 * usa). Quem já existe recebe a parte do e-mail antes do @; repetido ganha "-2", "-3"…
 */
export const MIGRACAO_NOME = `
  ALTER TABLE usuarios ADD COLUMN nome TEXT;
  UPDATE usuarios SET nome = lower(substr(email, 1, instr(email, '@') - 1));
  UPDATE usuarios SET nome = nome || '-' || (
    SELECT COUNT(*) + 1 FROM usuarios AS antes
    WHERE lower(substr(antes.email, 1, instr(antes.email, '@') - 1)) = usuarios.nome AND antes.id < usuarios.id
  )
  WHERE EXISTS (
    SELECT 1 FROM usuarios AS antes
    WHERE lower(substr(antes.email, 1, instr(antes.email, '@') - 1)) = usuarios.nome AND antes.id < usuarios.id
  );
  CREATE UNIQUE INDEX usuarios_por_nome ON usuarios (nome COLLATE NOCASE);
`;

/**
 * Migração 3: status da issue (Rascunho → Revisada → Aprovada) com o registro de quem mudou, e
 * links de compartilhamento só de leitura (o token fica só como hash).
 */
export const MIGRACAO_STATUS_E_LINKS = `
  ALTER TABLE issues ADD COLUMN status TEXT NOT NULL DEFAULT 'rascunho';
  CREATE TABLE issue_status (
    id INTEGER PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
    de TEXT NOT NULL,
    para TEXT NOT NULL,
    quem TEXT NOT NULL,
    quando INTEGER NOT NULL
  );
  CREATE INDEX issue_status_por_issue ON issue_status (issue_id, id);
  CREATE TABLE links (
    id INTEGER PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    criado_por TEXT NOT NULL,
    criado_em INTEGER NOT NULL,
    expira_em INTEGER NOT NULL,
    revogado_em INTEGER
  );
  CREATE INDEX links_por_issue ON links (issue_id);
`;

/** Migração 4: registro de auditoria (quem fez o quê, sem senhas, tokens nem texto de issue). */
export const MIGRACAO_AUDITORIA = `
  CREATE TABLE auditoria (
    id INTEGER PRIMARY KEY,
    quando INTEGER NOT NULL,
    quem TEXT NOT NULL,
    acao TEXT NOT NULL,
    alvo TEXT,
    detalhe TEXT,
    ip TEXT
  );
  CREATE INDEX auditoria_por_data ON auditoria (quando);
  CREATE INDEX auditoria_por_acao ON auditoria (acao, id);
`;

/** Migração 5: issue enviada ao Jira (uma por issue do histórico, com a chave e o link de lá). */
export const MIGRACAO_JIRA = `
  CREATE TABLE jira_envios (
    issue_id INTEGER PRIMARY KEY REFERENCES issues (id) ON DELETE CASCADE,
    chave TEXT NOT NULL,
    url TEXT NOT NULL,
    enviado_por TEXT NOT NULL,
    enviado_em INTEGER NOT NULL
  );
`;

/** Migração 6: sessões emitidas antes desta data deixam de valer (troca de senha, desativação). */
export const MIGRACAO_SESSOES = `
  ALTER TABLE usuarios ADD COLUMN sessoes_desde INTEGER NOT NULL DEFAULT 0;
`;

/**
 * Sessões guardadas no servidor (revogáveis): o cookie leva um id aleatório; o banco guarda só o
 * hash dele. Encerrar uma sessão é apagar a linha.
 */
export const MIGRACAO_SESSOES_REVOGAVEIS = `
  CREATE TABLE sessoes (
    id INTEGER PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    usuario TEXT NOT NULL,
    criada_em INTEGER NOT NULL,
    ultimo_uso INTEGER NOT NULL,
    expira_em INTEGER NOT NULL,
    ip TEXT,
    navegador TEXT
  );
  CREATE INDEX sessoes_por_usuario ON sessoes (usuario, ultimo_uso DESC);
  CREATE INDEX sessoes_por_expiracao ON sessoes (expira_em);
`;

/**
 * Falhas de login por conta (o texto digitado, normalizado), com a espera progressiva. Fica no
 * banco para o limite não zerar quando o servidor reinicia.
 */
export const MIGRACAO_TRAVAS_LOGIN = `
  CREATE TABLE travas_login (
    conta TEXT PRIMARY KEY,
    falhas INTEGER NOT NULL,
    ultima_falha INTEGER NOT NULL,
    travada_ate INTEGER NOT NULL DEFAULT 0
  );
`;

/**
 * MFA: segredo TOTP de cada pessoa (cifrado com a subchave "mfa"), códigos de recuperação (só o
 * hash) e, na sessão, se ela passou pelo segundo fator e quando a senha foi confirmada de novo.
 */
export const MIGRACAO_MFA = `
  CREATE TABLE mfa_totp (
    usuario TEXT PRIMARY KEY,
    segredo TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 0,
    criado_em INTEGER NOT NULL,
    ativado_em INTEGER,
    ultimo_passo INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE mfa_recuperacao (
    id INTEGER PRIMARY KEY,
    usuario TEXT NOT NULL,
    hash TEXT NOT NULL,
    usado_em INTEGER
  );
  CREATE INDEX mfa_recuperacao_por_usuario ON mfa_recuperacao (usuario);
  ALTER TABLE sessoes ADD COLUMN mfa INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sessoes ADD COLUMN reautenticada_em INTEGER NOT NULL DEFAULT 0;
`;

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
  MIGRACAO_NOME,
  MIGRACAO_STATUS_E_LINKS,
  MIGRACAO_AUDITORIA,
  MIGRACAO_JIRA,
  MIGRACAO_SESSOES,
  MIGRACAO_SESSOES_REVOGAVEIS,
  MIGRACAO_TRAVAS_LOGIN,
  MIGRACAO_MFA,
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
