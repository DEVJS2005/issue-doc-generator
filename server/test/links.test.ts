import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { abrirBanco } from "../src/banco/banco.js";
import { RepositorioHistorico } from "../src/banco/historico.js";
import { RepositorioLinks } from "../src/banco/links.js";
import { carregarConfig, type Config } from "../src/config.js";
import type { Provedor } from "../src/ia/tipos.js";
import { issueExemplo } from "./fixtures/issue.js";
import { EMAIL_TESTE, entrar, USUARIO_TESTE } from "./fixtures/login.js";

const DIA = 86_400_000;
const ENTRADA = { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" };

describe("links de compartilhamento (repositório)", () => {
  function cenario() {
    const db = abrirBanco(":memory:");
    const historico = new RepositorioHistorico(db);
    const id = historico.salvarNova("ana@x.dev", ENTRADA as never, issueExemplo(), "# Limitar cupons por pedido", "m");
    return { db, historico, id, links: new RepositorioLinks(db) };
  }

  it("o token abre a issue até vencer, e só o hash fica no banco", () => {
    const { db, id, links } = cenario();
    const t0 = 1_000_000;
    const { token, link } = links.criar(id, "ana@x.dev", 7, t0);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(link.expiraEm).toBe(t0 + 7 * DIA);
    expect(links.abrir(token, t0 + 6 * DIA)).toBe(id);
    expect(links.abrir(token, t0 + 7 * DIA + 1)).toBeNull();
    expect(links.abrir("outro-token", t0)).toBeNull();
    const guardado = JSON.stringify(db.prepare("SELECT * FROM links").all());
    expect(guardado).not.toContain(token);
  });

  it("revogar fecha o link na hora e ele sai da lista", () => {
    const { id, links } = cenario();
    const a = links.criar(id, "ana@x.dev", 30);
    const b = links.criar(id, "ana@x.dev", 1);
    expect(links.listar(id).map((l) => l.id).sort()).toEqual([a.link.id, b.link.id].sort());
    expect(links.revogar(id, a.link.id)).toBe(true);
    expect(links.abrir(a.token)).toBeNull();
    expect(links.listar(id).map((l) => l.id)).toEqual([b.link.id]);
    expect(links.revogar(id + 1, b.link.id)).toBe(false);
  });

  it("apagar a issue apaga os links dela", () => {
    const { historico, id, links } = cenario();
    const { token } = links.criar(id, "ana@x.dev", 7);
    historico.apagar(id);
    expect(links.abrir(token)).toBeNull();
  });
});

function fabrica() {
  return (c: Config): Provedor => ({
    nome: c.provedor,
    modelo: c.modelo,
    async gerar() {
      return { texto: JSON.stringify(issueExemplo()), modelo: c.modelo, usouFallback: false, uso: { entrada: 1, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
    },
  });
}

describe("links de compartilhamento (rotas)", () => {
  it("quem pode ver cria, lista e revoga; quem tem o link lê sem login", async () => {
    const a = await montarApp(
      carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},comum@exemplo.dev:senha-comum,outro@exemplo.dev:senha-outro`, ANTHROPIC_API_KEY: "sk-teste" }),
      { fabricaProvedor: fabrica() },
    );
    const comum = await entrar(a, "comum@exemplo.dev", "senha-comum");
    const outro = await entrar(a, "outro@exemplo.dev", "senha-outro");
    const corpo = (await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie: comum }, payload: ENTRADA })).body;
    const bloco = corpo.split("\n\n").filter((b) => b.startsWith("event: resultado")).at(-1)!;
    const id = JSON.parse(bloco.split("\n")[1].slice(6)).historicoId as number;

    const criar = (cookie: string, dias: unknown) =>
      a.inject({ method: "POST", url: `/api/historico/${id}/links`, headers: { cookie }, payload: { dias } });
    expect((await criar(outro, 7)).statusCode).toBe(404);
    expect((await criar(comum, 2)).statusCode).toBe(400);
    const novo = await criar(comum, 7);
    expect(novo.statusCode).toBe(201);
    const { url, link } = novo.json();
    expect(url).toMatch(/^\/compartilhado\/[A-Za-z0-9_-]{32,}$/);
    const token = url.split("/").at(-1);

    const publico = await a.inject({ method: "GET", url: `/api/publico/${token}` });
    expect(publico.statusCode).toBe(200);
    expect(publico.headers["x-robots-tag"]).toBe("noindex");
    expect(publico.headers["cache-control"]).toBe("no-store");
    expect(publico.json().issue).toMatchObject({ titulo: "Limitar cupons por pedido", produto: "Loja", status: "rascunho", versoes: 1, autor: "comum" });
    expect(publico.json().issue.markdown).toContain("# Limitar cupons por pedido");
    expect(JSON.stringify(publico.json())).not.toContain("comum@exemplo.dev");

    const lista = (await a.inject({ method: "GET", url: `/api/historico/${id}/links`, headers: { cookie: comum } })).json().links;
    expect(lista).toEqual([expect.objectContaining({ id: link.id, criadoPor: "comum" })]);
    expect(JSON.stringify(lista)).not.toContain(token);

    const revogar = await a.inject({ method: "DELETE", url: `/api/historico/${id}/links/${link.id}`, headers: { cookie: comum } });
    expect(revogar.statusCode).toBe(200);
    const depois = await a.inject({ method: "GET", url: `/api/publico/${token}` });
    expect(depois.statusCode).toBe(404);
    expect(depois.json().erro.mensagem).toBe("Este link não existe, venceu ou foi revogado.");

    // O admin também pode compartilhar a issue de outra pessoa.
    const admin = await entrar(a, EMAIL_TESTE);
    expect((await criar(admin, 1)).statusCode).toBe(201);
  });
});
