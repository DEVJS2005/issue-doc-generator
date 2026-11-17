import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { abrirBanco } from "../src/banco/banco.js";
import { RepositorioHistorico } from "../src/banco/historico.js";
import { carregarConfig, type Config } from "../src/config.js";
import type { Provedor } from "../src/ia/tipos.js";
import { issueExemplo } from "./fixtures/issue.js";
import { EMAIL_TESTE, entrar, USUARIO_TESTE } from "./fixtures/login.js";

const DIA = 86_400_000;
const BASE = Date.UTC(2026, 10, 10);

/** Banco com 4 issues de 2 pessoas, em dias diferentes. */
function historico() {
  const h = new RepositorioHistorico(abrirBanco(":memory:"));
  const salvar = (usuario: string, titulo: string, tipo: string, produto: string, descricao: string, dia: number) => {
    const issue = { ...issueExemplo(), titulo };
    return h.salvarNova(usuario, { descricao, tipo, produto, contexto: "" }, issue, `# ${titulo}\n\n${descricao}`, "m", BASE + dia * DIA);
  };
  const ids = {
    cupom: salvar("ana@x.dev", "Limitar cupons por pedido", "Melhoria", "Loja", "No checkout, até 3 cupons.", 0),
    frete: salvar("ana@x.dev", "Frete grátis acima de 200", "Nova funcionalidade", "Loja", "Frete grátis no carrinho.", 2),
    login: salvar("bia@x.dev", "Login trava com 100% de CPU", "Correção", "Portal", "Ao entrar, a tela congela.", 4),
    relat: salvar("bia@x.dev", "Relatório de vendas_mensal", "Melhoria", "Portal", "Exportar o relatório.", 6),
  };
  return { h, ids };
}

describe("busca no histórico (repositório)", () => {
  it("texto livre procura no título, no produto e no texto da issue, sem diferenciar maiúsculas", () => {
    const { h, ids } = historico();
    expect(h.listar({ texto: "CUPONS" }).map((i) => i.id)).toEqual([ids.cupom]);
    expect(h.listar({ texto: "carrinho" }).map((i) => i.id)).toEqual([ids.frete]);
    expect(h.listar({ texto: "portal" }).map((i) => i.id).sort()).toEqual([ids.login, ids.relat].sort());
  });

  it("% e _ no texto são procurados ao pé da letra", () => {
    const { h, ids } = historico();
    expect(h.listar({ texto: "100%" }).map((i) => i.id)).toEqual([ids.login]);
    expect(h.listar({ texto: "vendas_mensal" }).map((i) => i.id)).toEqual([ids.relat]);
    expect(h.listar({ texto: "s_m" }).map((i) => i.id)).toEqual([ids.relat]);
  });

  it("filtra por produto, tipo, pessoa e período, combinados", () => {
    const { h, ids } = historico();
    expect(h.listar({ produto: "loja" }).map((i) => i.id).sort()).toEqual([ids.cupom, ids.frete].sort());
    expect(h.listar({ tipo: "Melhoria" }).map((i) => i.id).sort()).toEqual([ids.cupom, ids.relat].sort());
    expect(h.listar({ usuario: "bia@x.dev", tipo: "Melhoria" }).map((i) => i.id)).toEqual([ids.relat]);
    expect(h.listar({ de: BASE + 1 * DIA, ate: BASE + 5 * DIA }).map((i) => i.id)).toEqual([ids.login, ids.frete]);
    expect(h.listar({ produto: "Portal", texto: "relatório", de: BASE + 5 * DIA }).map((i) => i.id)).toEqual([ids.relat]);
  });

  it("lista os produtos já usados, sem repetir", () => {
    const { h } = historico();
    expect(h.produtos()).toEqual(["Loja", "Portal"]);
    expect(h.produtos("bia@x.dev")).toEqual(["Portal"]);
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

describe("busca no histórico (rota)", () => {
  it("aplica os filtros da URL, mantém cada pessoa nas próprias issues e devolve os produtos", async () => {
    const a = await montarApp(
      carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},comum@exemplo.dev:senha-comum`, ANTHROPIC_API_KEY: "sk-teste" }),
      { fabricaProvedor: fabrica() },
    );
    const comum = await entrar(a, "comum@exemplo.dev", "senha-comum");
    const admin = await entrar(a, EMAIL_TESTE);
    const gerar = (cookie: string, produto: string, tipo: string) =>
      a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: { descricao: "Limitar cupons a 3.", tipo, produto, contexto: "" } });
    await gerar(comum, "Loja", "Melhoria");
    await gerar(comum, "Portal", "Correção");
    await gerar(admin, "Loja", "Melhoria");

    const busca = async (cookie: string, q: string) => (await a.inject({ method: "GET", url: `/api/historico?${q}`, headers: { cookie } })).json();

    const minhas = await busca(comum, "produto=loja&tipo=Melhoria");
    expect(minhas.itens).toHaveLength(1);
    expect(minhas.produtos).toEqual(["Loja", "Portal"]);
    expect((await busca(comum, "texto=cupons")).itens).toHaveLength(2);
    expect((await busca(comum, `de=${Date.now() + DIA}`)).itens).toHaveLength(0);
    // Pessoa comum não vê as dos outros, mesmo pedindo todos.
    expect((await busca(comum, "todos=1&produto=Loja")).itens).toHaveLength(1);
    expect((await busca(admin, "todos=1&produto=Loja")).itens).toHaveLength(2);

    const invalida = await a.inject({ method: "GET", url: "/api/historico?de=ontem", headers: { cookie: comum } });
    expect(invalida.statusCode).toBe(400);

    // A issue aberta traz o nome de quem gerou (para o cabeçalho do PDF).
    const aberta = (await a.inject({ method: "GET", url: `/api/historico/${minhas.itens[0].id}`, headers: { cookie: admin } })).json();
    expect(aberta.item.autor).toBe("comum");
  });
});
