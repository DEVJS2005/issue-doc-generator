import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { abrirBanco } from "../src/banco/banco.js";
import { abrirBackup, Backups, ErroBackup } from "../src/banco/backup.js";
import { carregarConfig } from "../src/config.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

// Chave fictícia, só para os testes.
const CHAVE = Buffer.alloc(32, 7);
const CHAVE_HEX = CHAVE.toString("hex");

function bancoEmArquivo(chave: Buffer | null = CHAVE) {
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), "backup-cripto-")), "issue-doc-generator.db");
  const db = abrirBanco(arquivo);
  db.prepare("INSERT INTO configuracao (chave, valor, atualizado_em, atualizado_por) VALUES ('marca', 'texto-que-nao-pode-aparecer', 1, 'x')").run();
  return { arquivo, db, backups: new Backups(db, arquivo, chave) };
}

describe("backup criptografado (BACKUP_CHAVE)", () => {
  it("com a chave, o backup sai como .db.enc, sem o conteúdo legível e sem cópia aberta na pasta", () => {
    const { backups } = bancoEmArquivo();
    const b = backups.fazer(Date.UTC(2026, 10, 25, 3, 4, 5));
    expect(b).toMatchObject({ criptografado: true });
    expect(b.nome).toMatch(/^issue-doc-generator-\d{4}-\d{2}-\d{2}-\d{9}\.db\.enc$/);
    const bruto = readFileSync(backups.caminho(b.nome)!);
    expect(bruto.subarray(0, 8).toString("latin1")).toBe("IDGBKP1\0");
    expect(bruto.includes(Buffer.from("texto-que-nao-pode-aparecer"))).toBe(false);
    expect(bruto.includes(Buffer.from("SQLite format 3"))).toBe(false);
    // Só o arquivo final na pasta: nada de .tmp nem .parcial.
    expect(readdirSync(backups.pasta)).toEqual([b.nome]);
  });

  it("com a mesma chave, o backup abre num banco SQLite com os dados", () => {
    const { backups } = bancoEmArquivo();
    const b = backups.fazer();
    const banco = abrirBackup(readFileSync(backups.caminho(b.nome)!), CHAVE);
    const destino = path.join(mkdtempSync(path.join(tmpdir(), "restaurado-")), "restaurado.db");
    writeFileSync(destino, banco);
    const db = new DatabaseSync(destino);
    expect(db.prepare("SELECT valor FROM configuracao WHERE chave = 'marca'").get()).toEqual({ valor: "texto-que-nao-pode-aparecer" });
    db.close();
  });

  it("chave errada, arquivo alterado ou arquivo que não é backup: erro claro, sem abrir nada", () => {
    const { backups } = bancoEmArquivo();
    const bruto = readFileSync(backups.caminho(backups.fazer().nome)!);
    expect(() => abrirBackup(bruto, randomBytes(32))).toThrow(/chave está errada ou o arquivo foi alterado/);
    const alterado = Buffer.from(bruto);
    alterado[40] ^= 1;
    expect(() => abrirBackup(alterado, CHAVE)).toThrow(ErroBackup);
    expect(() => abrirBackup(Buffer.from("SQLite format 3\0qualquer coisa"), CHAVE)).toThrow(/não é um backup criptografado/);
  });

  it("dois backups do mesmo banco não saem iguais (IV novo a cada um)", () => {
    const { backups } = bancoEmArquivo();
    const a = readFileSync(backups.caminho(backups.fazer(1_000).nome)!);
    const b = readFileSync(backups.caminho(backups.fazer(2_000).nome)!);
    expect(a.subarray(8, 20).equals(b.subarray(8, 20))).toBe(false);
  });

  it("a lista, a poda e o download valem para os criptografados e para os antigos sem criptografia", () => {
    const { arquivo, db } = bancoEmArquivo();
    const semChave = new Backups(db, arquivo, null);
    const antigo = semChave.fazer(Date.UTC(2026, 10, 1));
    const novo = new Backups(db, arquivo, CHAVE);
    const cifrado = novo.fazer(Date.UTC(2026, 10, 2));
    expect(novo.listar().map((b) => [b.nome, b.criptografado])).toEqual([
      [cifrado.nome, true],
      [antigo.nome, false],
    ]);
    expect(novo.caminho(cifrado.nome)).not.toBeNull();
    expect(novo.podar(1)).toBe(1);
    expect(novo.listar().map((b) => b.nome)).toEqual([cifrado.nome]);
  });

  it("BACKUP_CHAVE aceita 32 bytes em hex ou base64; outro valor impede o servidor de subir", () => {
    expect(carregarConfig({ BACKUP_CHAVE: CHAVE_HEX }).backupChave?.equals(CHAVE)).toBe(true);
    expect(carregarConfig({ BACKUP_CHAVE: CHAVE.toString("base64") }).backupChave?.equals(CHAVE)).toBe(true);
    expect(carregarConfig({}).backupChave).toBeNull();
    for (const ruim of ["curta", "a".repeat(63), Buffer.alloc(16).toString("hex")]) {
      expect(() => carregarConfig({ BACKUP_CHAVE: ruim }), ruim).toThrow(/BACKUP_CHAVE/);
    }
  });

  it("o admin baixa o backup criptografado como arquivo binário", async () => {
    const pasta = mkdtempSync(path.join(tmpdir(), "backup-app-"));
    const app = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE, ARQUIVO_BANCO: path.join(pasta, "banco.db"), BACKUP_CHAVE: CHAVE_HEX }));
    const cookie = await entrar(app);
    const feito = await app.inject({ method: "POST", url: "/api/admin/backups", headers: { cookie } });
    const { backup } = feito.json() as { backup: { nome: string; criptografado: boolean } };
    expect(backup.criptografado).toBe(true);
    const r = await app.inject({ method: "GET", url: `/api/admin/backups/${backup.nome}`, headers: { cookie } });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/octet-stream");
    expect(r.rawPayload.subarray(0, 8).toString("latin1")).toBe("IDGBKP1\0");
    await app.close();
  });
});

describe("script de restauração", () => {
  const script = path.join(import.meta.dirname, "..", "src", "restaurar-backup.ts");
  const tsx = path.join(import.meta.dirname, "..", "..", "node_modules", ".bin", "tsx");
  const rodar = (args: string[], env: NodeJS.ProcessEnv) => {
    try {
      return { codigo: 0, saida: execFileSync(tsx, [script, ...args], { env: { ...process.env, ...env }, encoding: "utf8", stdio: "pipe" }) };
    } catch (e) {
      const err = e as { status: number; stderr: string };
      return { codigo: err.status, saida: err.stderr };
    }
  };

  it("abre o backup com a chave do ambiente e grava um banco que abre", () => {
    const { backups } = bancoEmArquivo();
    const enc = backups.caminho(backups.fazer().nome)!;
    const saida = path.join(mkdtempSync(path.join(tmpdir(), "restaurar-")), "restaurado.db");
    expect(rodar([enc, saida], { BACKUP_CHAVE: CHAVE_HEX }).codigo).toBe(0);
    const db = new DatabaseSync(saida);
    expect(db.prepare("SELECT COUNT(*) AS n FROM configuracao WHERE chave = 'marca'").get()).toEqual({ n: 1 });
    db.close();
  });

  it("sem a chave, com a chave errada ou com saída já existente, não grava nada e explica", () => {
    const { backups } = bancoEmArquivo();
    const enc = backups.caminho(backups.fazer().nome)!;
    const pasta = mkdtempSync(path.join(tmpdir(), "restaurar-"));
    const saida = path.join(pasta, "restaurado.db");
    expect(rodar([enc, saida], { BACKUP_CHAVE: "" })).toMatchObject({ codigo: 1, saida: expect.stringContaining("Defina BACKUP_CHAVE") });
    expect(rodar([enc, saida], { BACKUP_CHAVE: randomBytes(32).toString("hex") })).toMatchObject({ codigo: 1, saida: expect.stringContaining("chave está errada") });
    expect(existsSync(saida)).toBe(false);
    writeFileSync(saida, "já existe");
    expect(rodar([enc, saida], { BACKUP_CHAVE: CHAVE_HEX })).toMatchObject({ codigo: 1, saida: expect.stringContaining("já existe") });
    expect(readFileSync(saida, "utf8")).toBe("já existe");
  });
});
