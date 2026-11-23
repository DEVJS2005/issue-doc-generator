import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig, type Config } from "../src/config.js";
import type { Provedor } from "../src/ia/tipos.js";
import { montarMarkdown } from "../src/issue/markdown.js";
import { formatarEntrada } from "../src/prompt/entrada.js";
import { promptSistema } from "../src/prompt/montar.js";
import { CorpoGerar } from "../src/rotas/gerar.js";
import { issueExemplo } from "./fixtures/issue.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

const ENTRADA = { descricao: "Limitar cupons a 3.", tipo: "Melhoria" as const, produto: "Loja", contexto: "" };

describe("issue em outro idioma", () => {
  it("o pedido só leva a tag <idioma> fora do português (o prompt dos exemplos não muda)", () => {
    expect(formatarEntrada(ENTRADA)).not.toContain("<idioma>");
    expect(formatarEntrada({ ...ENTRADA, idioma: "pt-BR" })).not.toContain("<idioma>");
    expect(formatarEntrada({ ...ENTRADA, idioma: "en" })).toContain("<idioma>en</idioma>");
    expect(formatarEntrada({ ...ENTRADA, idioma: "es" })).toContain("<idioma>es</idioma>");
  });

  it("o prompt de sistema explica a tag e manda manter [a preencher] e os valores fixos", () => {
    const p = promptSistema();
    expect(p).toContain("`<idioma>`");
    expect(p).toMatch(/\[a preencher\].{0,80}em qualquer idioma/s);
  });

  it("aceita pt-BR, en e es; recusa outros; o padrão é pt-BR", () => {
    expect(CorpoGerar.parse(ENTRADA).idioma).toBe("pt-BR");
    expect(CorpoGerar.parse({ ...ENTRADA, idioma: "en" }).idioma).toBe("en");
    const r = CorpoGerar.safeParse({ ...ENTRADA, idioma: "fr" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Escolha o idioma: português, inglês ou espanhol.");
  });

  it("o Markdown sai com os títulos e rótulos no idioma pedido", () => {
    const en = montarMarkdown(issueExemplo(), "en");
    for (const t of ["| Field | Value |", "| Type | Improvement |", "## Problem", "## Technical Requirement", "## Acceptance Criteria", "## Test cases", "### Questions for the PO"]) {
      expect(en, t).toContain(t);
    }
    expect(en).toContain("[a preencher]");
    const es = montarMarkdown(issueExemplo(), "es");
    for (const t of ["| Campo | Valor |", "## Problema", "## Solución", "## Criterios de aceptación", "## Casos de prueba", "### Dudas para el PO"]) {
      expect(es, t).toContain(t);
    }
    expect(montarMarkdown(issueExemplo(), "pt-BR")).toBe(montarMarkdown(issueExemplo()));
  });
});

describe("geração em outro idioma (rota)", () => {
  it("gera e refina em inglês, e o histórico guarda o idioma", async () => {
    const pedidos: string[] = [];
    const fabrica = (c: Config): Provedor => ({
      nome: c.provedor,
      modelo: c.modelo,
      async gerar({ usuario }) {
        pedidos.push(usuario);
        return { texto: JSON.stringify(issueExemplo()), modelo: c.modelo, usouFallback: false, uso: { entrada: 1, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
      },
    });
    const a = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE, ANTHROPIC_API_KEY: "sk-teste" }), { fabricaProvedor: fabrica });
    const cookie = await entrar(a);
    const resultado = (corpo: string) => {
      const bloco = corpo.split("\n\n").filter((b) => b.startsWith("event: resultado")).at(-1)!;
      return JSON.parse(bloco.split("\n")[1].slice(6));
    };
    const entrada = { ...ENTRADA, idioma: "en" };
    const r = resultado((await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: entrada })).body);
    expect(pedidos[0]).toContain("<idioma>en</idioma>");
    expect(r.markdown).toContain("## Acceptance Criteria");

    const aberta = (await a.inject({ method: "GET", url: `/api/historico/${r.historicoId}`, headers: { cookie } })).json();
    expect(aberta.item.entrada.idioma).toBe("en");

    const refinada = resultado(
      (
        await a.inject({
          method: "POST",
          url: "/api/refinar",
          headers: { cookie },
          payload: { entrada: aberta.item.entrada, issue: issueExemplo(), ajuste: "High priority", historicoId: r.historicoId, versao: aberta.item.versoes },
        })
      ).body,
    );
    expect(pedidos[1]).toContain("<idioma>en</idioma>");
    expect(refinada.markdown).toContain("## Acceptance Criteria");
  });
});
