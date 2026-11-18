import { describe, expect, it } from "vitest";
import { avaliarQualidade } from "../src/issue/qualidade.js";
import type { Issue } from "../src/issue/schema.js";
import { EXEMPLOS } from "../src/prompt/exemplos/index.js";
import { issueExemplo } from "./fixtures/issue.js";

const falhas = (i: Issue) =>
  avaliarQualidade(i)
    .grupos.flatMap((g) => g.itens)
    .filter((x) => !x.ok)
    .map((x) => x.texto);

describe("nota de qualidade", () => {
  it("dá nota, nível e grupos INVEST/ISTQB, com sugestão só nos itens que falham", () => {
    const q = avaliarQualidade(issueExemplo());
    expect(q.nota).toBeGreaterThanOrEqual(0);
    expect(q.nota).toBeLessThanOrEqual(100);
    expect(["pronta", "quase", "revisar"]).toContain(q.nivel);
    expect(q.grupos.map((g) => g.id)).toEqual(["valor", "escopo", "criterios", "casos", "revisao"]);
    for (const it of q.grupos.flatMap((g) => g.itens)) expect(it.sugestao === null).toBe(it.ok);
  });

  it("os exemplos de referência do prompt não ficam em 'revisar'", () => {
    for (const e of EXEMPLOS) expect(avaliarQualidade(e.saida).nivel, e.nome).not.toBe("revisar");
  });

  it("acusa termo vago em critério, inclusive com acento, e não confunde palavras parecidas", () => {
    const base = issueExemplo();
    const vago = { ...base, criterios: base.criterios.map((c, i) => (i === 0 ? { ...c, texto: "A tela deve ser rápida e fácil de usar." } : c)) };
    expect(falhas(vago)).toContain("Critérios sem termos vagos");
    // "facilidade" e "etcetera" não são os termos da lista.
    const parecido = { ...base, criterios: base.criterios.map((c, i) => (i === 0 ? { ...c, texto: "Mostra a facilidade escolhida." } : c)) };
    expect(falhas(parecido)).not.toContain("Critérios sem termos vagos");
  });

  it("pede valor limite quando as regras têm números, e caso negativo ou limite em geral", () => {
    const base = issueExemplo();
    const semLimite = { ...base, casos: base.casos.map((k) => ({ ...k, tipo: "feliz" as const })) };
    const f = falhas(semLimite);
    expect(f).toContain("Tem caso negativo ou de valor limite");
    expect(f).toContain("Regras com números têm caso de valor limite");
  });

  it("acusa [a preencher] no núcleo e lacuna sem dúvida para o PO", () => {
    const base = issueExemplo();
    const lacuna = { ...base, solucao: "[a preencher]", revisao: { ...base.revisao, duvidas: [] } };
    const f = falhas(lacuna);
    expect(f).toContain("Título, problema e solução sem [a preencher]");
    expect(f).toContain("Cada [a preencher] vira pergunta para o PO");
    expect(avaliarQualidade(lacuna).nota).toBeLessThan(avaliarQualidade(base).nota);
  });

  it("issue vazia fica em 'revisar'", () => {
    const base = issueExemplo();
    const vazia: Issue = { ...base, problema: "", solucao: "", perfis: [], regras: [], criterios: [], casos: [], fora_de_escopo: [] };
    expect(avaliarQualidade(vazia).nivel).toBe("revisar");
  });
});

describe("nota de qualidade nas rotas", () => {
  it("vem no resultado da geração e ao abrir a issue do histórico", async () => {
    const { montarApp } = await import("../src/app.js");
    const { carregarConfig } = await import("../src/config.js");
    const { entrar, USUARIO_TESTE } = await import("./fixtures/login.js");
    const app = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE, ANTHROPIC_API_KEY: "sk-teste" }), {
      provedor: {
        nome: "anthropic",
        modelo: "falso",
        async gerar() {
          return { texto: JSON.stringify(issueExemplo()), modelo: "falso", usouFallback: false, uso: { entrada: 1, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
        },
      },
    });
    const cookie = await entrar(app);
    const r = await app.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" } });
    const bloco = r.body.split("\n\n").find((b) => b.startsWith("event: resultado"))!;
    const resultado = JSON.parse(bloco.split("\n")[1].slice(6));
    expect(resultado.qualidade).toEqual(avaliarQualidade(issueExemplo()));

    const aberta = await app.inject({ method: "GET", url: `/api/historico/${resultado.historicoId}`, headers: { cookie } });
    expect(aberta.json().item.qualidade.nota).toBe(resultado.qualidade.nota);
    expect(Array.isArray(aberta.json().item.avisos)).toBe(true);
    await app.close();
    // Monta o app inteiro com imports dinâmicos: mais folga que os 5 s padrão em máquina ocupada.
  }, 20_000);
});
