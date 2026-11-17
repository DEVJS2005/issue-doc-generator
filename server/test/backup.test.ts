import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { abrirBanco } from "../src/banco/banco.js";
import { Backups } from "../src/banco/backup.js";
import { carregarConfig } from "../src/config.js";
import { EMAIL_TESTE, entrar, USUARIO_TESTE } from "./fixtures/login.js";

const HORA = 3_600_000;

function bancoEmArquivo() {
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), "backup-")), "issue-doc-generator.db");
  const db = abrirBanco(arquivo);
  db.prepare("INSERT INTO configuracao (chave, valor, atualizado_em, atualizado_por) VALUES ('teste', '1', 1, 'x')").run();
  return { arquivo, db, backups: new Backups(db, arquivo) };
}

describe("backup do banco", () => {
  it("faz uma cópia consistente na pasta backups, ao lado do banco", () => {
    const { arquivo, backups } = bancoEmArquivo();
    const b = backups.fazer(Date.UTC(2026, 10, 17, 3, 4, 5));
    expect(b.nome).toMatch(/^issue-doc-generator-\d{4}-\d{2}-\d{2}-\d{9}\.db$/);
    expect(path.dirname(backups.caminho(b.nome)!)).toBe(path.join(path.dirname(arquivo), "backups"));
    const copia = new DatabaseSync(backups.caminho(b.nome)!);
    expect(copia.prepare("SELECT valor FROM configuracao WHERE chave = 'teste'").get()).toEqual({ valor: "1" });
    copia.close();
    expect(backups.listar().map((x) => x.nome)).toEqual([b.nome]);
    expect(backups.listar()[0].bytes).toBeGreaterThan(0);
  });

  it("o backup diário só roda se o último tem mais de 24 h, e guarda só as N cópias mais novas", () => {
    const { backups } = bancoEmArquivo();
    const t0 = Date.UTC(2026, 10, 1, 12);
    expect(backups.diario(3, t0)).not.toBeNull();
    expect(backups.diario(3, t0 + 2 * HORA)).toBeNull();
    for (let dia = 1; dia <= 4; dia++) backups.diario(3, t0 + dia * 25 * HORA);
    const nomes = backups.listar().map((b) => b.nome);
    expect(nomes).toHaveLength(3);
    expect(nomes[0] > nomes[2]).toBe(true);
  });

  it("só entrega arquivos de backup pelo nome exato (sem caminhos)", () => {
    const { backups } = bancoEmArquivo();
    backups.fazer();
    for (const nome of ["../issue-doc-generator.db", "issue-doc-generator.db", "..\\x.db", "issue-doc-generator-2026-11-17-000000000.db"]) {
      expect(backups.caminho(nome), nome).toBeNull();
    }
  });

  it("com banco em memória fica indisponível", () => {
    const backups = new Backups(abrirBanco(":memory:"), ":memory:");
    expect(backups.disponivel).toBe(false);
    expect(backups.listar()).toEqual([]);
    expect(backups.diario(7)).toBeNull();
  });
});

describe("rotas de backup", () => {
  it("o admin lista, faz e baixa backups; usuário comum não", async () => {
    const { arquivo, db } = bancoEmArquivo();
    db.close();
    const a = await montarApp(
      carregarConfig({ ARQUIVO_BANCO: arquivo, USUARIOS_PERMITIDOS: `${USUARIO_TESTE},comum@exemplo.dev:senha-comum` }),
    );
    const admin = await entrar(a, EMAIL_TESTE);
    const comum = await entrar(a, "comum@exemplo.dev", "senha-comum");

    // A subida já faz o backup do dia.
    const lista = (await a.inject({ method: "GET", url: "/api/admin/backups", headers: { cookie: admin } })).json();
    expect(lista.disponivel).toBe(true);
    expect(lista.backups).toHaveLength(1);
    expect(lista.copias).toBe(7);

    const novo = await a.inject({ method: "POST", url: "/api/admin/backups", headers: { cookie: admin } });
    expect(novo.statusCode).toBe(201);
    const nome = novo.json().backup.nome;

    const baixado = await a.inject({ method: "GET", url: `/api/admin/backups/${nome}`, headers: { cookie: admin } });
    expect(baixado.statusCode).toBe(200);
    expect(baixado.headers["content-disposition"]).toBe(`attachment; filename="${nome}"`);
    expect(baixado.rawPayload.subarray(0, 15).toString()).toBe("SQLite format 3");

    expect((await a.inject({ method: "GET", url: "/api/admin/backups/nao-existe.db", headers: { cookie: admin } })).statusCode).toBe(404);
    expect((await a.inject({ method: "GET", url: "/api/admin/backups", headers: { cookie: comum } })).statusCode).toBe(403);
    expect(readdirSync(path.join(path.dirname(arquivo), "backups"))).toHaveLength(2);
    await a.close();
    expect(existsSync(arquivo)).toBe(true);
  });

  it("as rotas de backup têm limite de pedidos por minuto", async () => {
    const a = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE }));
    const admin = await entrar(a);
    const listar = () => a.inject({ method: "GET", url: "/api/admin/backups", headers: { cookie: admin } });
    for (let i = 0; i < 20; i++) expect((await listar()).statusCode).toBe(200);
    const bloqueado = await listar();
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json().erro.codigo).toBe("muitas_tentativas");
    // As outras rotas da administração não entram nesse limite.
    expect((await a.inject({ method: "GET", url: "/api/admin/ajustes", headers: { cookie: admin } })).statusCode).toBe(200);
  });

  it("com banco em memória, fazer backup responde 409 com o motivo", async () => {
    const a = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE }));
    const admin = await entrar(a);
    expect((await a.inject({ method: "GET", url: "/api/admin/backups", headers: { cookie: admin } })).json().disponivel).toBe(false);
    const r = await a.inject({ method: "POST", url: "/api/admin/backups", headers: { cookie: admin } });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro.mensagem).toBe("Backup indisponível: o banco está em memória.");
  });
});
