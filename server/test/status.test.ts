import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { carregarConfig, type Config } from "../src/config.js";
import type { Provedor } from "../src/ia/tipos.js";
import { issueExemplo } from "./fixtures/issue.js";
import { EMAIL_TESTE, entrar, USUARIO_TESTE } from "./fixtures/login.js";

const ENTRADA = { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" };

function fabrica() {
  return (c: Config): Provedor => ({
    nome: c.provedor,
    modelo: c.modelo,
    async gerar() {
      return { texto: JSON.stringify(issueExemplo()), modelo: c.modelo, usouFallback: false, uso: { entrada: 1, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
    },
  });
}

async function cenario() {
  const a = await montarApp(
    carregarConfig({
      USUARIOS_PERMITIDOS: `${USUARIO_TESTE},comum@exemplo.dev:senha-comum,outro@exemplo.dev:senha-outro`,
      ANTHROPIC_API_KEY: "sk-teste",
    }),
    { fabricaProvedor: fabrica() },
  );
  const comum = await entrar(a, "comum@exemplo.dev", "senha-comum");
  const outro = await entrar(a, "outro@exemplo.dev", "senha-outro");
  const admin = await entrar(a, EMAIL_TESTE);
  const corpo = (await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie: comum }, payload: ENTRADA })).body;
  const bloco = corpo.split("\n\n").filter((b) => b.startsWith("event: resultado")).at(-1)!;
  const id = JSON.parse(bloco.split("\n")[1].slice(6)).historicoId as number;
  const mudar = (cookie: string, status: string) =>
    a.inject({ method: "PATCH", url: `/api/historico/${id}/status`, headers: { cookie }, payload: { status } });
  const ler = async (cookie: string) => (await a.inject({ method: "GET", url: `/api/historico/${id}`, headers: { cookie } })).json();
  return { a, comum, outro, admin, id, mudar, ler };
}

describe("status da issue", () => {
  it("nasce como rascunho e muda com quem e quando", async () => {
    const { comum, admin, mudar, ler } = await cenario();
    expect((await ler(comum)).item.status).toBe("rascunho");

    const r = await mudar(comum, "revisada");
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("revisada");
    await mudar(admin, "aprovada");

    const aberta = await ler(comum);
    expect(aberta.item.status).toBe("aprovada");
    expect(aberta.mudancasStatus.map((m: { de: string; para: string; quem: string }) => `${m.de}>${m.para}:${m.quem}`)).toEqual([
      "rascunho>revisada:comum",
      "revisada>aprovada:qa",
    ]);
    expect(aberta.mudancasStatus[0].quando).toBeGreaterThan(0);
  });

  it("recusa status inválido e quem não pode ver a issue", async () => {
    const { outro, comum, mudar } = await cenario();
    expect((await mudar(comum, "publicada")).statusCode).toBe(400);
    expect((await mudar(outro, "aprovada")).statusCode).toBe(404);
  });

  it("repetir o status atual não registra mudança", async () => {
    const { comum, mudar, ler } = await cenario();
    await mudar(comum, "rascunho");
    expect((await ler(comum)).mudancasStatus).toEqual([]);
  });

  it("refinar uma issue revisada ou aprovada volta para rascunho", async () => {
    const { a, comum, id, mudar, ler } = await cenario();
    await mudar(comum, "aprovada");
    await a.inject({
      method: "POST",
      url: "/api/refinar",
      headers: { cookie: comum },
      payload: { entrada: ENTRADA, issue: issueExemplo(), ajuste: "Prioridade Alta", historicoId: id, versao: 1 },
    });
    const aberta = await ler(comum);
    expect(aberta.item.status).toBe("rascunho");
    expect(aberta.mudancasStatus.at(-1)).toMatchObject({ de: "aprovada", para: "rascunho", quem: "comum" });
  });

  it("a lista mostra o status e filtra por ele", async () => {
    const { a, comum, mudar } = await cenario();
    await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie: comum }, payload: ENTRADA });
    await mudar(comum, "revisada");
    const todas = (await a.inject({ method: "GET", url: "/api/historico", headers: { cookie: comum } })).json().itens;
    expect(todas.map((i: { status: string }) => i.status).sort()).toEqual(["rascunho", "revisada"]);
    const revisadas = (await a.inject({ method: "GET", url: "/api/historico?status=revisada", headers: { cookie: comum } })).json().itens;
    expect(revisadas).toHaveLength(1);
  });
});
