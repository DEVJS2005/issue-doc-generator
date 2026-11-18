import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig } from "../src/config.js";
import { montarMarkdown } from "../src/issue/markdown.js";
import { criarClienteJira, type ConfigJira } from "../src/integracoes/jira.js";
import { emLinha, markdownParaJira } from "../src/integracoes/jira-texto.js";
import type { Provedor } from "../src/ia/tipos.js";
import { EXEMPLOS } from "../src/prompt/exemplos/index.js";
import { issueExemplo } from "./fixtures/issue.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

type Pedido = { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: unknown };

/** Jira falso: responde conforme o caminho e guarda o que recebeu. */
function jiraFalso(respostas: Record<string, { status: number; corpo: unknown }>) {
  const pedidos: Pedido[] = [];
  const buscar = (async (url: string, init?: RequestInit) => {
    const caminho = new URL(url).pathname;
    pedidos.push({ url, metodo: init?.method ?? "GET", cabecalhos: init?.headers as Record<string, string>, corpo: init?.body ? JSON.parse(String(init.body)) : null });
    const r = respostas[`${init?.method ?? "GET"} ${caminho}`] ?? { status: 404, corpo: { errorMessages: ["não existe"] } };
    return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { pedidos, buscar };
}

const CLOUD: ConfigJira = { url: "https://empresa.atlassian.net/", email: "qa@empresa.com", token: "tok-123" };
const RESPOSTAS = {
  "GET /rest/api/2/project": { status: 200, corpo: [{ key: "LOJ", name: "Loja" }, { key: "ADM", name: "Administração" }] },
  "GET /rest/api/2/issue/createmeta/LOJ/issuetypes": {
    status: 200,
    corpo: { values: [{ id: "10001", name: "História" }, { id: "10002", name: "Bug" }, { id: "10003", name: "Subtarefa", subtask: true }] },
  },
  "POST /rest/api/2/issue": { status: 201, corpo: { id: "1", key: "LOJ-42" } },
};

describe("Markdown para o texto do Jira", () => {
  it("converte títulos, listas, tabelas, negrito, código e blocos", () => {
    const md = [
      "# Título",
      "## Seção",
      "Texto com **negrito** e `codigo`.",
      "- item",
      "  - subitem",
      "1. primeiro",
      "| Campo | Valor |",
      "|---|---|",
      "| Tipo | Melhoria<br>outra linha |",
      "| Barra | a \\| b |",
      "```",
      "SE x ENTÃO [y]",
      "```",
      "---",
    ].join("\n");
    expect(markdownParaJira(md).split("\n")).toEqual([
      "h1. Título",
      "h2. Seção",
      "Texto com *negrito* e {{codigo}}.",
      "* item",
      "** subitem",
      "# primeiro",
      "||Campo||Valor||",
      "|Tipo|Melhoria \\\\ outra linha|",
      "|Barra|a \\| b|",
      "{noformat}",
      "SE x ENTÃO [y]",
      "{noformat}",
      "----",
    ]);
  });

  it("escapa o que o Jira leria como formatação ([a preencher] não vira link)", () => {
    expect(emLinha("Prioridade: [a preencher]")).toBe("Prioridade: \\[a preencher\\]");
    expect(emLinha("chaves {x}, 2*3, ^sup^, ~sub~ e -riscado-")).toBe("chaves \\{x\\}, 2\\*3, \\^sup\\^, \\~sub\\~ e \\-riscado-");
    expect(emLinha("palavra-composta continua")).toBe("palavra-composta continua");
  });

  it("converte as issues de exemplo sem sobrar Markdown de tabela nem de título", () => {
    for (const e of EXEMPLOS) {
      const jira = markdownParaJira(montarMarkdown(e.saida));
      // "# item" é lista numerada no Jira; título em Markdown seria "## ...".
      expect(jira).not.toMatch(/^#{2,6} /m);
      expect(jira).not.toMatch(/^\|---/m);
      expect(jira).not.toContain("**");
      expect(jira).toMatch(/^h1\. /m);
    }
  });
});

describe("cliente do Jira", () => {
  it("Cloud: Basic com e-mail e token; lista projetos e tipos (sem subtarefa)", async () => {
    const { pedidos, buscar } = jiraFalso(RESPOSTAS);
    const jira = criarClienteJira(CLOUD, buscar);
    expect(await jira.projetos()).toEqual([
      { chave: "ADM", nome: "Administração" },
      { chave: "LOJ", nome: "Loja" },
    ]);
    expect(await jira.tipos("LOJ")).toEqual([
      { id: "10001", nome: "História" },
      { id: "10002", nome: "Bug" },
    ]);
    expect(pedidos[0].url).toBe("https://empresa.atlassian.net/rest/api/2/project");
    expect(pedidos[0].cabecalhos.authorization).toBe(`Basic ${Buffer.from("qa@empresa.com:tok-123").toString("base64")}`);
  });

  it("Data Center: Bearer só com o token", async () => {
    const { pedidos, buscar } = jiraFalso(RESPOSTAS);
    await criarClienteJira({ url: "https://jira.empresa.local", email: "", token: "pat-9" }, buscar).projetos();
    expect(pedidos[0].cabecalhos.authorization).toBe("Bearer pat-9");
  });

  it("cria a issue com resumo cortado em 255, descrição e rótulo; devolve chave e link", async () => {
    const { pedidos, buscar } = jiraFalso(RESPOSTAS);
    const r = await criarClienteJira(CLOUD, buscar).criar({ projeto: "LOJ", tipoId: "10001", resumo: "x".repeat(300), descricao: "h1. Oi", rotulos: ["issue-doc-generator"] });
    expect(r).toEqual({ chave: "LOJ-42", url: "https://empresa.atlassian.net/browse/LOJ-42" });
    const campos = (pedidos[0].corpo as { fields: Record<string, unknown> }).fields;
    expect(campos).toMatchObject({ project: { key: "LOJ" }, issuetype: { id: "10001" }, description: "h1. Oi", labels: ["issue-doc-generator"] });
    expect(String(campos.summary)).toHaveLength(255);
  });

  it("traduz os erros do Jira em mensagens claras", async () => {
    const credencial = jiraFalso({ "GET /rest/api/2/project": { status: 401, corpo: {} } });
    await expect(criarClienteJira(CLOUD, credencial.buscar).projetos()).rejects.toThrow(/recusou as credenciais/);
    const campo = jiraFalso({ "POST /rest/api/2/issue": { status: 400, corpo: { errors: { customfield_1: "Campo obrigatório." } } } });
    await expect(criarClienteJira(CLOUD, campo.buscar).criar({ projeto: "LOJ", tipoId: "1", resumo: "a", descricao: "b", rotulos: [] })).rejects.toThrow(
      "O Jira recusou: customfield_1: Campo obrigatório.",
    );
    const rede = criarClienteJira(CLOUD, (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch);
    await expect(rede.projetos()).rejects.toThrow(/Não foi possível falar com o Jira/);
  });
});

describe("rotas do Jira", () => {
  const provedor: Provedor = {
    nome: "anthropic",
    modelo: "falso",
    async gerar() {
      return { texto: JSON.stringify(issueExemplo()), modelo: "falso", usouFallback: false, uso: { entrada: 1, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
    },
  };

  async function app(jira: ReturnType<typeof criarClienteJira> | null) {
    const a = await montarApp(
      carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},outra@exemplo.dev:senha-da-outra`, ANTHROPIC_API_KEY: "sk-teste" }),
      { provedor, jira },
    );
    const cookie = await entrar(a, "outra@exemplo.dev", "senha-da-outra");
    await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" } });
    const id = (await a.inject({ method: "GET", url: "/api/historico", headers: { cookie } })).json().itens[0].id as number;
    return { a, cookie, id };
  }

  it("desligado: informa, e não deixa enviar", async () => {
    const { a, cookie, id } = await app(null);
    expect((await a.inject({ method: "GET", url: "/api/jira", headers: { cookie } })).json()).toEqual({ ligado: false, url: null });
    const r = await a.inject({ method: "POST", url: `/api/historico/${id}/jira`, headers: { cookie }, payload: { projeto: "LOJ", tipoId: "10001" } });
    expect(r.statusCode).toBe(404);
    expect(r.json().erro.codigo).toBe("jira_desligado");
    await a.close();
  });

  it("cria uma vez só, guarda o link e não deixa outra pessoa enviar a issue alheia", async () => {
    const { pedidos, buscar } = jiraFalso(RESPOSTAS);
    const { a, cookie, id } = await app(criarClienteJira(CLOUD, buscar));
    expect((await a.inject({ method: "GET", url: "/api/jira/projetos", headers: { cookie } })).json().projetos).toHaveLength(2);

    const r = await a.inject({ method: "POST", url: `/api/historico/${id}/jira`, headers: { cookie }, payload: { projeto: "LOJ", tipoId: "10001" } });
    expect(r.statusCode).toBe(201);
    expect(r.json().envio).toMatchObject({ chave: "LOJ-42", url: "https://empresa.atlassian.net/browse/LOJ-42", enviadoPor: "outra" });
    const criacao = pedidos.find((p) => p.metodo === "POST")!;
    const descricao = (criacao.corpo as { fields: { description: string } }).fields.description;
    expect(descricao).toMatch(/^h1\. /);
    expect(descricao).toContain("Gerada pelo Issue Doc Generator");

    const denovo = await a.inject({ method: "POST", url: `/api/historico/${id}/jira`, headers: { cookie }, payload: { projeto: "LOJ", tipoId: "10001" } });
    expect(denovo.statusCode).toBe(409);
    expect(denovo.json().envio.chave).toBe("LOJ-42");
    expect(pedidos.filter((p) => p.metodo === "POST")).toHaveLength(1);

    const envio = await a.inject({ method: "GET", url: `/api/historico/${id}/jira`, headers: { cookie } });
    expect(envio.json().envio).toMatchObject({ chave: "LOJ-42", enviadoPor: "outra" });

    // Usuário comum que não é dono não vê nem envia (o admin qa vê, como no histórico).
    const terceiro = await entrar(a, "qa@exemplo.dev", "senha-de-teste");
    expect((await a.inject({ method: "GET", url: `/api/historico/${id}/jira`, headers: { cookie: terceiro } })).statusCode).toBe(200);
    await a.close();
  });

  it("sem login, as rotas do Jira respondem 401", async () => {
    const { a } = await app(null);
    expect((await a.inject({ method: "GET", url: "/api/jira" })).statusCode).toBe(401);
    await a.close();
  });
});
