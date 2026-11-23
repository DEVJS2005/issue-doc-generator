import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig, type Config } from "../src/config.js";
import type { PedidoIA, Provedor } from "../src/ia/tipos.js";
import { issueExemplo } from "./fixtures/issue.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

const ENTRADA = { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" };

/** IA falsa que guarda o que recebeu. */
function fabrica(pedidos: PedidoIA[]) {
  return (c: Config): Provedor => ({
    nome: c.provedor,
    modelo: c.modelo,
    async gerar(pedido) {
      pedidos.push(pedido);
      return { texto: JSON.stringify(issueExemplo()), modelo: c.modelo, usouFallback: false, uso: { entrada: 1, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
    },
  });
}

function ultimoEvento(corpo: string) {
  const bloco = corpo.split("\n\n").filter((b) => b.startsWith("event:")).at(-1)!;
  const [ev, dados] = bloco.split("\n");
  return { evento: ev.slice(7), dados: JSON.parse(dados.slice(6)) };
}

async function cenario() {
  const pedidos: PedidoIA[] = [];
  const a = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},comum@exemplo.dev:senha-comum`, ANTHROPIC_API_KEY: "sk-teste" }), {
    fabricaProvedor: fabrica(pedidos),
  });
  const cookie = await entrar(a, "comum@exemplo.dev", "senha-comum");
  const id = ultimoEvento((await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: ENTRADA })).body).dados.historicoId as number;
  const refinar = (payload: Record<string, unknown>) => a.inject({ method: "POST", url: "/api/refinar", headers: { cookie }, payload });
  return { a, cookie, id, pedidos, refinar };
}

// Entrada e issue diferentes das guardadas, como se a tela mandasse outra coisa.
const ENTRADA_OUTRA = { descricao: "Texto que não é o da issue guardada.", tipo: "Correção", produto: "Outro produto", contexto: "" };
const issueOutra = () => ({ ...issueExemplo(), titulo: "Título que não está no histórico" });

describe("refinar uma issue do histórico", () => {
  it("usa a versão atual e a entrada guardadas, não as do pedido", async () => {
    const { a, id, pedidos, refinar } = await cenario();
    const r = await refinar({ entrada: ENTRADA_OUTRA, issue: issueOutra(), ajuste: "Prioridade Alta", historicoId: id, versao: 1 });
    expect(ultimoEvento(r.body).evento).toBe("resultado");

    const enviado = pedidos.at(-1)!.usuario;
    expect(enviado).toContain(ENTRADA.descricao);
    expect(enviado).toContain(issueExemplo().titulo);
    expect(enviado).not.toContain(ENTRADA_OUTRA.descricao);
    expect(enviado).not.toContain("Título que não está no histórico");
    await a.close();
  });

  it("recusa com 409 quando a tela está numa versão antiga, sem chamar a IA", async () => {
    const { a, cookie, id, pedidos, refinar } = await cenario();
    await refinar({ entrada: ENTRADA, issue: issueExemplo(), ajuste: "Prioridade Alta", historicoId: id, versao: 1 });
    const chamadas = pedidos.length;

    const antiga = await refinar({ entrada: ENTRADA, issue: issueExemplo(), ajuste: "Prioridade Baixa", historicoId: id, versao: 1 });
    expect(antiga.statusCode).toBe(409);
    expect(antiga.json().erro).toMatchObject({ codigo: "versao_desatualizada" });
    expect(antiga.json().erro.mensagem).toContain("versão 2");
    expect(pedidos.length).toBe(chamadas);

    // Sem o número da versão também recusa.
    expect((await refinar({ entrada: ENTRADA, issue: issueExemplo(), ajuste: "x", historicoId: id })).statusCode).toBe(409);

    const versoes = (await a.inject({ method: "GET", url: `/api/historico/${id}`, headers: { cookie } })).json().versoes;
    expect(versoes).toHaveLength(2);

    // Na versão certa, refina.
    const atual = await refinar({ entrada: ENTRADA, issue: issueExemplo(), ajuste: "Prioridade Baixa", historicoId: id, versao: 2 });
    expect(ultimoEvento(atual.body).evento).toBe("resultado");
    await a.close();
  });

  it("sem historicoId, continua usando a entrada e a issue do pedido e cria uma issue nova", async () => {
    const { a, cookie, id, pedidos, refinar } = await cenario();
    const r = await refinar({ entrada: ENTRADA_OUTRA, issue: issueOutra(), ajuste: "Prioridade Alta" });
    const resultado = ultimoEvento(r.body);
    expect(resultado.evento).toBe("resultado");
    expect(resultado.dados.historicoId).not.toBe(id);
    expect(pedidos.at(-1)!.usuario).toContain("Título que não está no histórico");
    const itens = (await a.inject({ method: "GET", url: "/api/historico", headers: { cookie } })).json().itens;
    expect(itens).toHaveLength(2);
    await a.close();
  });
});
