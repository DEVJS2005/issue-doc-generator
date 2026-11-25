import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Banco } from "./banco.js";

export type InfoBackup = { nome: string; bytes: number; criadoEm: number; criptografado: boolean };

// issue-doc-generator-AAAA-MM-DD-HHmmssSSS.db (ou .db.enc, criptografado), com o horário em UTC.
const NOME = /^issue-doc-generator-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(\d{3})\.db(\.enc)?$/;

/**
 * Formato do backup criptografado: "IDGBKP1" + byte 0 (8 bytes), IV de 12 bytes, o banco cifrado
 * com AES-256-GCM e a etiqueta de autenticação de 16 bytes no fim. O cabeçalho entra como dado
 * autenticado: trocar qualquer byte do arquivo faz a abertura falhar.
 */
const MAGICO = Buffer.from("IDGBKP1\0", "latin1");
const TAM_IV = 12;
const TAM_TAG = 16;
const CABECALHO_SQLITE = Buffer.from("SQLite format 3\0", "latin1");

export class ErroBackup extends Error {}

export function criptografar(dados: Buffer, chave: Buffer): Buffer {
  const iv = randomBytes(TAM_IV);
  const cifra = createCipheriv("aes-256-gcm", chave, iv);
  cifra.setAAD(MAGICO);
  const corpo = Buffer.concat([cifra.update(dados), cifra.final()]);
  return Buffer.concat([MAGICO, iv, corpo, cifra.getAuthTag()]);
}

/** Abre um backup criptografado e confere que o resultado é um banco SQLite. */
export function abrirBackup(arquivo: Buffer, chave: Buffer): Buffer {
  if (arquivo.length < MAGICO.length + TAM_IV + TAM_TAG || !arquivo.subarray(0, MAGICO.length).equals(MAGICO)) {
    throw new ErroBackup("O arquivo não é um backup criptografado do issue-doc-generator.");
  }
  const iv = arquivo.subarray(MAGICO.length, MAGICO.length + TAM_IV);
  const corpo = arquivo.subarray(MAGICO.length + TAM_IV, arquivo.length - TAM_TAG);
  const decifra = createDecipheriv("aes-256-gcm", chave, iv);
  decifra.setAAD(MAGICO);
  decifra.setAuthTag(arquivo.subarray(arquivo.length - TAM_TAG));
  let banco: Buffer;
  try {
    banco = Buffer.concat([decifra.update(corpo), decifra.final()]);
  } catch {
    throw new ErroBackup("Não foi possível abrir o backup: a chave está errada ou o arquivo foi alterado.");
  }
  if (!banco.subarray(0, CABECALHO_SQLITE.length).equals(CABECALHO_SQLITE)) {
    throw new ErroBackup("O backup abriu, mas o conteúdo não é um banco SQLite.");
  }
  return banco;
}
const DIA_MS = 86_400_000;

function nomePara(agora: number, criptografado: boolean): string {
  const d = new Date(agora);
  const n = (v: number, t = 2) => String(v).padStart(t, "0");
  return (
    `issue-doc-generator-${d.getUTCFullYear()}-${n(d.getUTCMonth() + 1)}-${n(d.getUTCDate())}-` +
    `${n(d.getUTCHours())}${n(d.getUTCMinutes())}${n(d.getUTCSeconds())}${n(d.getUTCMilliseconds(), 3)}.db${criptografado ? ".enc" : ""}`
  );
}

function quandoDe(nome: string): number | null {
  const m = NOME.exec(nome);
  if (!m) return null;
  const [, a, me, d, h, mi, s, ms] = m.map(Number);
  return Date.UTC(a, me - 1, d, h, mi, s, ms);
}

/**
 * Backup do banco SQLite na pasta "backups", ao lado do arquivo do banco (no Docker, dentro do
 * volume). Usa VACUUM INTO: uma cópia consistente, feita com o servidor rodando. Com
 * BACKUP_CHAVE, a cópia é criptografada (AES-256-GCM) e a versão aberta nunca fica no disco
 * depois do backup.
 */
export class Backups {
  readonly disponivel: boolean;
  readonly pasta: string;

  constructor(
    private readonly db: Banco,
    arquivoBanco: string,
    private readonly chave: Buffer | null = null,
  ) {
    this.disponivel = arquivoBanco !== ":memory:";
    this.pasta = this.disponivel ? path.join(path.dirname(path.resolve(arquivoBanco)), "backups") : "";
  }

  /** Mais novos primeiro. */
  listar(): InfoBackup[] {
    if (!this.disponivel || !existsSync(this.pasta)) return [];
    return readdirSync(this.pasta)
      .map((nome) => ({ nome, criadoEm: quandoDe(nome) }))
      .filter((b): b is { nome: string; criadoEm: number } => b.criadoEm !== null)
      .map((b) => ({ ...b, bytes: statSync(path.join(this.pasta, b.nome)).size, criptografado: b.nome.endsWith(".enc") }))
      .sort((a, b) => b.criadoEm - a.criadoEm);
  }

  fazer(agora = Date.now()): InfoBackup {
    if (!this.disponivel) throw new Error("Backup indisponível: o banco está em memória.");
    mkdirSync(this.pasta, { recursive: true });
    const nome = nomePara(agora, this.chave !== null);
    const destino = path.join(this.pasta, nome);
    // Sem chave, a cópia vai direto para o destino. Com chave, passa por um arquivo temporário que
    // é apagado logo depois de cifrado; o arquivo final aparece de uma vez (rename).
    const copia = this.chave ? `${destino}.tmp` : destino;
    this.db.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`);
    if (this.chave) {
      try {
        writeFileSync(`${destino}.parcial`, criptografar(readFileSync(copia), this.chave), { mode: 0o600 });
        renameSync(`${destino}.parcial`, destino);
      } finally {
        rmSync(copia, { force: true });
        rmSync(`${destino}.parcial`, { force: true });
      }
    }
    return { nome, bytes: statSync(destino).size, criadoEm: agora, criptografado: this.chave !== null };
  }

  /** Apaga os mais antigos, mantendo só as `copias` mais novas. Devolve quantos apagou. */
  podar(copias: number): number {
    const sobra = this.listar().slice(Math.max(1, copias));
    for (const b of sobra) rmSync(path.join(this.pasta, b.nome), { force: true });
    return sobra.length;
  }

  /** Faz o backup do dia se o último tiver mais de 24 h (ou não houver nenhum) e poda os antigos. */
  diario(copias: number, agora = Date.now()): InfoBackup | null {
    if (!this.disponivel) return null;
    const ultimo = this.listar()[0];
    if (ultimo && agora - ultimo.criadoEm < DIA_MS) return null;
    const novo = this.fazer(agora);
    this.podar(copias);
    return novo;
  }

  /**
   * Caminho de um backup pelo nome exato; null para qualquer outro nome. O caminho é montado com o
   * nome lido da própria pasta, nunca com o texto recebido: não há como apontar para fora dela.
   */
  caminho(nome: string): string | null {
    if (!this.disponivel || quandoDe(nome) === null) return null;
    const encontrado = this.listar().find((b) => b.nome === nome);
    return encontrado ? path.join(this.pasta, encontrado.nome) : null;
  }
}
