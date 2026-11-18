import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { abrirBanco } from "../src/banco/banco.js";
import { RepositorioAuditoria } from "../src/banco/auditoria.js";
import { carregarConfig } from "../src/config.js";
import type { Provedor } from "../src/ia/tipos.js";
import { issueExemplo } from "./fixtures/issue.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

const provedor: Provedor = {
  nome: "anthropic",
  modelo: "falso",
  async gerar() {
    return { texto: JSON.stringify(issueExemplo()), modelo: "falso", usouFallback: false, uso: { entrada: 1, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
  },
};

async function app() {
  return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},comum@exemplo.dev:senha-do-comum`, ANTHROPIC_API_KEY: "sk-teste" }), { provedor });
}

async function eventos(a: Awaited<ReturnType<typeof app>>, cookie: string, query = "") {
  const r = await a.inject({ method: "GET", url: `/api/admin/auditoria${query}`, headers: { cookie } });
  expect(r.statusCode).toBe(200);
  return r.json() as { eventos: { quem: string; acao: string; alvo: string | null; detalhe: Record<string, unknown> | null; ip: string | null }[]; proximo: number | null };
}

describe("auditoria", () => {
  it("registra login, falha de login, geração, criação e alteração de usuário, sem senhas", async () => {
    const a = await app();
    const falha = await a.inject({ method: "POST", url: "/api/login", payload: { usuario: "qa", senha: "errada-123" } });
    expect(falha.statusCode).toBe(401);
    const cookie = await entrar(a);

    const gerar = await a.inject({
      method: "POST",
      url: "/api/gerar",
      headers: { cookie },
      payload: { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" },
    });
    expect(gerar.statusCode).toBe(200);
    const criado = await a.inject({
      method: "POST",
      url: "/api/admin/usuarios",
      headers: { cookie },
      payload: { email: "nova@exemplo.dev", senha: "senha-secreta-1", admin: false },
    });
    const id = criado.json().usuario.id;
    await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${id}`, headers: { cookie }, payload: { senha: "outra-secreta-2", ativo: false } });

    const { eventos: lista } = await eventos(a, cookie);
    const porAcao = Object.fromEntries(lista.map((e) => [e.acao, e]));
    expect(lista.map((e) => e.acao)).toEqual(["alterar_usuario", "criar_usuario", "gerar", "login", "login_falhou"]);
    expect(porAcao.login_falhou).toMatchObject({ quem: "(desconhecido)", detalhe: { tentativa: "qa" } });
    expect(porAcao.login.quem).toBe("qa@exemplo.dev");
    expect(porAcao.gerar.detalhe).toEqual({ tipo: "Melhoria", produto: "Loja", idioma: "pt-BR" });
    expect(porAcao.criar_usuario.detalhe).toMatchObject({ email: "nova@exemplo.dev", admin: false });
    expect(porAcao.alterar_usuario).toMatchObject({ alvo: String(id), detalhe: { campos: ["senha", "ativo"], ativo: false } });
    expect(porAcao.login.ip).toBeTruthy();

    // Nenhuma senha (nem a errada) aparece na auditoria.
    const tudo = JSON.stringify(lista);
    for (const segredo of ["errada-123", "senha-secreta-1", "outra-secreta-2", "senha-de-teste"]) expect(tudo).not.toContain(segredo);
    await a.close();
  });

  it("não registra pedidos recusados nem leituras", async () => {
    const a = await app();
    const cookie = await entrar(a);
    await a.inject({ method: "GET", url: "/api/historico", headers: { cookie } });
    await a.inject({ method: "POST", url: "/api/admin/usuarios", headers: { cookie }, payload: { email: "sem-arroba", senha: "curta" } });
    const { eventos: lista } = await eventos(a, cookie);
    expect(lista.map((e) => e.acao)).toEqual(["login"]);
    await a.close();
  });

  it("só o admin consulta, com filtro por ação e por pessoa", async () => {
    const a = await app();
    const admin = await entrar(a);
    const comum = await entrar(a, "comum@exemplo.dev", "senha-do-comum");
    expect((await a.inject({ method: "GET", url: "/api/admin/auditoria", headers: { cookie: comum } })).statusCode).toBe(403);

    expect((await eventos(a, admin, "?acao=login")).eventos).toHaveLength(2);
    const doComum = await eventos(a, admin, "?quem=comum");
    expect(doComum.eventos.map((e) => e.quem)).toEqual(["comum@exemplo.dev"]);
    expect((await a.inject({ method: "GET", url: "/api/admin/auditoria?acao=inventada", headers: { cookie: admin } })).statusCode).toBe(400);
    await a.close();
  });
});

describe("RepositorioAuditoria", () => {
  it("pagina por cursor, filtra por período, escapa curingas e expurga pela retenção", () => {
    const repo = new RepositorioAuditoria(abrirBanco(":memory:"));
    const dia = 86_400_000;
    for (let i = 0; i < 5; i++) repo.registrar({ quem: `p${i}@x.dev`, acao: "gerar", alvo: null, detalhe: null, ip: null, quando: i * dia });
    repo.registrar({ quem: "a_b@x.dev", acao: "login", alvo: null, detalhe: null, ip: null, quando: 5 * dia });

    const p1 = repo.listar({ limite: 4 });
    expect(p1.eventos).toHaveLength(4);
    const p2 = repo.listar({ limite: 4, antesDe: p1.proximo! });
    expect(p2.eventos).toHaveLength(2);
    expect(p2.proximo).toBeNull();

    expect(repo.listar({ de: 2 * dia, ate: 3 * dia }).eventos.map((e) => e.quem)).toEqual(["p3@x.dev", "p2@x.dev"]);
    // "_" é curinga no LIKE: precisa casar só com o "_" de verdade.
    expect(repo.listar({ quem: "a_b" }).eventos).toHaveLength(1);
    expect(repo.listar({ quem: "p_" }).eventos).toHaveLength(0);

    expect(repo.expurgar(2, 5 * dia)).toBe(3);
    expect(repo.listar().eventos).toHaveLength(3);
  });
});
