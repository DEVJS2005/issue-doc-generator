import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import type { Banco } from "./banco.js";

export type InfoBackup = { nome: string; bytes: number; criadoEm: number };

// issue-doc-generator-AAAA-MM-DD-HHmmssSSS.db, com o horário em UTC.
const NOME = /^issue-doc-generator-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(\d{3})\.db$/;
const DIA_MS = 86_400_000;

function nomePara(agora: number): string {
  const d = new Date(agora);
  const n = (v: number, t = 2) => String(v).padStart(t, "0");
  return (
    `issue-doc-generator-${d.getUTCFullYear()}-${n(d.getUTCMonth() + 1)}-${n(d.getUTCDate())}-` +
    `${n(d.getUTCHours())}${n(d.getUTCMinutes())}${n(d.getUTCSeconds())}${n(d.getUTCMilliseconds(), 3)}.db`
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
 * volume). Usa VACUUM INTO: uma cópia consistente, feita com o servidor rodando.
 */
export class Backups {
  readonly disponivel: boolean;
  readonly pasta: string;

  constructor(
    private readonly db: Banco,
    arquivoBanco: string,
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
      .map((b) => ({ ...b, bytes: statSync(path.join(this.pasta, b.nome)).size }))
      .sort((a, b) => b.criadoEm - a.criadoEm);
  }

  fazer(agora = Date.now()): InfoBackup {
    if (!this.disponivel) throw new Error("Backup indisponível: o banco está em memória.");
    mkdirSync(this.pasta, { recursive: true });
    const nome = nomePara(agora);
    const destino = path.join(this.pasta, nome);
    this.db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    return { nome, bytes: statSync(destino).size, criadoEm: agora };
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
