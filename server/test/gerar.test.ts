import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig } from "../src/config.js";
import { codigoPorStatus, ErroGeracao, normalizarErro } from "../src/ia/erros.js";
import { extrairJson, schemaParaProvedor, secaoAtual } from "../src/ia/json.js";
import type { Provedor, RespostaIA } from "../src/ia/tipos.js";
import { issueExemplo } from "./fixtures/issue.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada evento SSE tem um formato; o teste confere campo a campo
type EventoSse = { evento: string; dados: any };

function lerSse(corpo: string): EventoSse[] {
  return corpo
    .split("\n\n")
    .filter((b) => b.startsWith("event:"))
    .map((b) => {
      const [linhaEvento, linhaDados] = b.split("\n");
      return { evento: linhaEvento.slice(7), dados: JSON.parse(linhaDados.slice(6)) };
    });
}

const ENTRADA = { descricao: "O botão salvar não grava o cupom.", tipo: "Correção", produto: "Loja", contexto: "" };

/** Provedor falso: devolve o texto em pedaços, como um stream, ou falha. */
function provedorFalso(comportamento: {
  texto?: string;
  falha?: unknown;
  esperarCancelamento?: boolean;
  aoPedir?: (sistema: string, usuario: string) => void;
}): Provedor {
  return {
    nome: "anthropic",
    modelo: "modelo-falso",
    async gerar({ sistema, usuario }, { signal, aoProgresso }): Promise<RespostaIA> {
      comportamento.aoPedir?.(sistema, usuario);
      aoProgresso({ fase: "analisando" });
      if (comportamento.esperarCancelamento) {
        await new Promise((_, rejeitar) => signal.addEventListener("abort", () => rejeitar(new Error("abortado"))));
      }
      if (comportamento.falha) throw comportamento.falha;
      const texto = comportamento.texto ?? JSON.stringify(issueExemplo());
      for (let i = 0; i < texto.length; i += 200) aoProgresso({ fase: "escrevendo", delta: texto.slice(i, i + 200) });
      return { texto, modelo: "modelo-falso", usouFallback: false, uso: { entrada: 10, saida: 20, cacheLeitura: 900, cacheEscrita: 0 } };
    },
  };
}

async function gerar(provedor: Provedor | null, corpo: unknown = ENTRADA, env: NodeJS.ProcessEnv = {}) {
  const app = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE, ...env }), { provedor });
  const cookie = await entrar(app);
  return app.inject({ method: "POST", url: "/api/gerar", payload: corpo as object, headers: { cookie } });
}

describe("POST /api/gerar", () => {
  it("transmite início, progresso e resultado com o Markdown montado", async () => {
    const r = await gerar(provedorFalso({}));
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("text/event-stream");
    const eventos = lerSse(r.body);
    expect(eventos[0]).toEqual({ evento: "inicio", dados: { provedor: "anthropic", modelo: "modelo-falso" } });
    expect(eventos[1]).toEqual({ evento: "progresso", dados: { fase: "analisando", caracteres: 0, secao: null } });
    const final = eventos.at(-1)!;
    expect(final.evento).toBe("resultado");
    expect(final.dados.issue.titulo).toBe("Limitar cupons por pedido");
    expect(final.dados.markdown).toContain("## Casos de teste");
    expect(final.dados.avisos).toEqual([]);
  });

  it("manda o prompt de sistema fixo e a entrada entre tags", async () => {
    let sistemaRecebido = "";
    let usuarioRecebido = "";
    await gerar(provedorFalso({ aoPedir: (s, u) => ((sistemaRecebido = s), (usuarioRecebido = u)) }));
    expect(sistemaRecebido.startsWith("# Papel")).toBe(true);
    expect(usuarioRecebido).toContain("<descricao>\nO botão salvar não grava o cupom.\n</descricao>");
    expect(usuarioRecebido).toContain("<tipo>Correção</tipo>");
  });

  it("não expõe a chave da API em nenhum evento", async () => {
    const r = await gerar(provedorFalso({}), ENTRADA, { ANTHROPIC_API_KEY: "sk-ant-segredo-123" });
    expect(r.body).not.toContain("sk-ant-segredo-123");
  });

  it("devolve avisos de coerência quando a IA erra a estrutura", async () => {
    const i = issueExemplo();
    i.casos = i.casos.filter((c) => c.tipo !== "feliz");
    const final = lerSse((await gerar(provedorFalso({ texto: JSON.stringify(i) }))).body).at(-1)!;
    expect(final.evento).toBe("resultado");
    expect(final.dados.avisos.map((a: { codigo: string }) => a.codigo)).toContain("criterio_sem_feliz");
  });

  it.each([
    ["recusa", new ErroGeracao("recusa"), "não quis gerar"],
    ["max_tokens", new ErroGeracao("max_tokens"), "grande demais"],
    ["limite_taxa", Object.assign(new Error("429"), { status: 429 }), "limite de uso"],
    ["autenticacao", Object.assign(new Error("401"), { status: 401 }), "autenticar"],
    ["servidor", Object.assign(new Error("529"), { status: 529 }), "instável"],
    [
      "sem_credito",
      Object.assign(new Error('400 {"error":{"message":"Your credit balance is too low to access the Anthropic API."}}'), { status: 400 }),
      "sem crédito",
    ],
    ["sem_credito", Object.assign(new Error("429 You exceeded your current quota"), { status: 429 }), "sem crédito"],
  ])("traduz %s numa mensagem amigável, sem stack trace", async (codigo, falha, trecho) => {
    const r = await gerar(provedorFalso({ falha }));
    const final = lerSse(r.body).at(-1)!;
    expect(final.evento).toBe("erro");
    expect(final.dados.codigo).toBe(codigo);
    expect(final.dados.mensagem).toContain(trecho);
    expect(r.body).not.toMatch(/at .*\.ts:\d+|Error:/);
  });

  it("avisa JSON inválido e JSON fora do schema", async () => {
    for (const texto of ["isto não é JSON", JSON.stringify({ titulo: "só isso" })]) {
      const final = lerSse((await gerar(provedorFalso({ texto }))).body).at(-1)!;
      expect(final.dados.codigo).toBe("json_invalido");
      expect(final.dados.podeTentarDeNovo).toBe(true);
    }
  });

  it("interrompe a IA ao passar do tempo limite", async () => {
    const r = await gerar(provedorFalso({ esperarCancelamento: true }), ENTRADA, { TEMPO_LIMITE_SEGUNDOS: "1" });
    const final = lerSse(r.body).at(-1)!;
    expect(final.evento).toBe("erro");
    expect(final.dados.codigo).toBe("tempo_esgotado");
  });

  it("valida a entrada antes de chamar a IA", async () => {
    let chamou = false;
    const p = provedorFalso({ aoPedir: () => (chamou = true) });
    const casos: [unknown, string][] = [
      [{ ...ENTRADA, descricao: "   " }, "A descrição é obrigatória."],
      [{ ...ENTRADA, descricao: "x".repeat(4001) }, "A descrição pode ter até 4000 caracteres."],
      [{ ...ENTRADA, contexto: "x".repeat(8001) }, "O contexto pode ter até 8000 caracteres."],
      [{ ...ENTRADA, tipo: "Bug" }, "Escolha um tipo válido."],
    ];
    for (const [corpo, mensagem] of casos) {
      const r = await gerar(p, corpo);
      expect(r.statusCode).toBe(400);
      expect(r.json().erro.mensagem).toBe(mensagem);
    }
    expect(chamou).toBe(false);
  });

  it("aceita descrição com exatamente 4000 caracteres e contexto com 8000", async () => {
    const r = await gerar(provedorFalso({}), { ...ENTRADA, descricao: "x".repeat(4000), contexto: "y".repeat(8000) });
    expect(r.statusCode).toBe(200);
  });

  it("responde 503 quando não há provedor configurado", async () => {
    const r = await gerar(null);
    expect(r.statusCode).toBe(503);
    expect(r.json().erro.codigo).toBe("nao_configurado");
  });
});

describe("utilitários da IA", () => {
  it("extrai JSON puro, cercado por ```json e com texto em volta", () => {
    expect(extrairJson('{"a":1}')).toEqual({ a: 1 });
    expect(extrairJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extrairJson('Aqui está:\n{"a":1}\nPronto.')).toEqual({ a: 1 });
    expect(() => extrairJson("nada")).toThrow();
  });

  it("descobre a seção que está sendo escrita", () => {
    expect(secaoAtual('{"titulo":"X","problema":"Y","solucao":"')).toBe("Solução");
    expect(secaoAtual('{"titulo":"X","casos":[{"id":"CT1","tipo":"feliz"')).toBe("Casos de teste");
    expect(secaoAtual("")).toBeNull();
  });

  it("gera schema sem $schema para os provedores", () => {
    const s = schemaParaProvedor();
    expect(s.$schema).toBeUndefined();
    expect(s.type).toBe("object");
  });

  it("mapeia status HTTP para códigos", () => {
    expect(codigoPorStatus(401)).toBe("autenticacao");
    expect(codigoPorStatus(403)).toBe("autenticacao");
    expect(codigoPorStatus(429)).toBe("limite_taxa");
    expect(codigoPorStatus(500)).toBe("servidor");
    expect(codigoPorStatus(529)).toBe("servidor");
    expect(codigoPorStatus(400)).toBe("requisicao_invalida");
    expect(codigoPorStatus(undefined)).toBe("conexao");
  });

  it("usa o motivo do cancelamento quando o sinal foi abortado", () => {
    const c = new AbortController();
    c.abort(new ErroGeracao("tempo_esgotado"));
    expect(normalizarErro(new Error("abortado"), c.signal).codigo).toBe("tempo_esgotado");
    const c2 = new AbortController();
    c2.abort();
    expect(normalizarErro(new Error("x"), c2.signal).codigo).toBe("cancelado");
    const c3 = new AbortController();
    c3.abort(new DOMException("passou do tempo", "TimeoutError"));
    expect(normalizarErro(new Error("x"), c3.signal).codigo).toBe("tempo_esgotado");
  });
});
