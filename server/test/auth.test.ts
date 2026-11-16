import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { criarAutenticadorEnv } from "../src/auth/autenticador.js";
import { Limitador } from "../src/auth/limite.js";
import { criarSessoes, lerCookie } from "../src/auth/sessao.js";
import { carregarConfig } from "../src/config.js";
import { custoEstimado, lerPreco } from "../src/custo.js";
import { partesAlteradas } from "../src/issue/alteracoes.js";
import type { Provedor } from "../src/ia/tipos.js";
import { issueExemplo } from "./fixtures/issue.js";
import { EMAIL_TESTE, entrar, SENHA_TESTE, USUARIO_TESTE } from "./fixtures/login.js";

const ENTRADA = { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" };

function provedorFalso(texto = JSON.stringify(issueExemplo())): Provedor & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    nome: "anthropic",
    modelo: "claude-opus-5-5",
    chamadas,
    async gerar({ usuario }) {
      chamadas.push(usuario);
      return { texto, modelo: "claude-opus-5-5", usouFallback: false, uso: { entrada: 1000, saida: 5000, cacheLeitura: 20000, cacheEscrita: 0 } };
    },
  };
}

async function app(env: NodeJS.ProcessEnv = {}, provedor: Provedor = provedorFalso()) {
  return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE, ...env }), { provedor });
}

describe("login", () => {
  it("sem login, as rotas da IA respondem 401", async () => {
    const a = await app();
    for (const [method, url] of [
      ["POST", "/api/gerar"],
      ["POST", "/api/refinar"],
      ["GET", "/api/opcoes"],
    ] as const) {
      const r = await a.inject({ method, url, payload: method === "POST" ? ENTRADA : undefined });
      expect(r.statusCode, url).toBe(401);
      expect(r.json().erro.codigo).toBe("nao_autenticado");
    }
  });

  it("entra com e-mail e senha certos e recebe cookie HttpOnly e SameSite=Strict", async () => {
    const a = await app();
    const r = await a.inject({ method: "POST", url: "/api/login", payload: { email: "QA@Exemplo.dev", senha: SENHA_TESTE } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ usuario: { email: EMAIL_TESTE } });
    const cookie = String(r.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain(SENHA_TESTE);
  });

  it("recusa senha errada e e-mail desconhecido com a mesma mensagem", async () => {
    const a = await app();
    for (const payload of [
      { email: EMAIL_TESTE, senha: "errada" },
      { email: "ninguem@exemplo.dev", senha: SENHA_TESTE },
    ]) {
      const r = await a.inject({ method: "POST", url: "/api/login", payload });
      expect(r.statusCode).toBe(401);
      expect(r.json().erro.mensagem).toBe("E-mail ou senha incorretos.");
    }
  });

  it("bloqueia a 11ª tentativa de login em 15 minutos", async () => {
    const a = await app();
    for (let i = 0; i < 10; i++) {
      await a.inject({ method: "POST", url: "/api/login", payload: { email: EMAIL_TESTE, senha: "errada" } });
    }
    const r = await a.inject({ method: "POST", url: "/api/login", payload: { email: EMAIL_TESTE, senha: SENHA_TESTE } });
    expect(r.statusCode).toBe(429);
  });

  it("informa a sessão e sai", async () => {
    const a = await app();
    const cookie = await entrar(a);
    expect((await a.inject({ method: "GET", url: "/api/sessao", headers: { cookie } })).json()).toEqual({ usuario: { email: EMAIL_TESTE } });
    const saida = await a.inject({ method: "POST", url: "/api/sair", headers: { cookie } });
    expect(String(saida.headers["set-cookie"])).toContain("Max-Age=0");
    expect((await a.inject({ method: "GET", url: "/api/sessao" })).statusCode).toBe(401);
  });

  it("não deixa entrar quando a lista de usuários está vazia", async () => {
    const a = await app({ USUARIOS_PERMITIDOS: "" });
    const r = await a.inject({ method: "POST", url: "/api/login", payload: { email: EMAIL_TESTE, senha: SENHA_TESTE } });
    expect(r.statusCode).toBe(401);
  });
});

describe("sessão assinada", () => {
  const s = criarSessoes("segredo-de-teste", 12);

  it("lê o token que criou", () => {
    expect(s.ler(s.criar({ email: "a@x.dev" }))).toEqual({ email: "a@x.dev" });
  });

  it("recusa token adulterado, de outro segredo ou vencido", () => {
    const token = s.criar({ email: "a@x.dev" });
    const [dados, assinatura] = token.split(".");
    const outroDado = Buffer.from("admin@x.dev|9999999999999").toString("base64url");
    expect(s.ler(`${outroDado}.${assinatura}`)).toBeNull();
    expect(criarSessoes("outro-segredo", 12).ler(token)).toBeNull();
    expect(s.ler(`${dados}.${assinatura}`, Date.now() + 13 * 3_600_000)).toBeNull();
    expect(s.ler("lixo")).toBeNull();
    expect(s.ler(undefined)).toBeNull();
  });

  it("lê cookie do cabeçalho", () => {
    expect(lerCookie("a=1; idg_sessao=abc%2E1; b=2", "idg_sessao")).toBe("abc.1");
    expect(lerCookie(undefined, "idg_sessao")).toBeUndefined();
  });
});

describe("autenticador do .env", () => {
  it("aceita senha com ':' e ignora entradas malformadas", async () => {
    const a = criarAutenticadorEnv(["ana@x.dev:abc:123", "semsenha", ":sem-email", "bia@x.dev:"]);
    expect(await a.autenticar("ana@x.dev", "abc:123")).toEqual({ email: "ana@x.dev" });
    expect(await a.autenticar("bia@x.dev", "")).toBeNull();
  });
});

describe("limite de uso por hora", () => {
  it("libera até o máximo e bloqueia o máximo+1, voltando depois da janela", () => {
    const l = new Limitador(3, 3_600_000);
    const t = 1_000_000;
    expect(l.tentar("u", t).ok).toBe(true);
    expect(l.tentar("u", t + 1).ok).toBe(true);
    expect(l.tentar("u", t + 2)).toEqual({ ok: true, restam: 0 });
    expect(l.tentar("u", t + 3)).toEqual({ ok: false, liberaEm: t + 3_600_000 });
    expect(l.tentar("outro", t + 3).ok).toBe(true);
    expect(l.tentar("u", t + 3_600_001).ok).toBe(true);
  });

  it("a rota responde 429 com mensagem clara quando o usuário passa do limite", async () => {
    const a = await app({ LIMITE_POR_HORA: "2" });
    const cookie = await entrar(a);
    const pedir = () => a.inject({ method: "POST", url: "/api/gerar", payload: ENTRADA, headers: { cookie } });
    expect((await pedir()).statusCode).toBe(200);
    expect((await pedir()).statusCode).toBe(200);
    const r = await pedir();
    expect(r.statusCode).toBe(429);
    expect(r.json().erro.codigo).toBe("limite_uso");
    expect(r.json().erro.mensagem).toMatch(/limite de 2 gerações por hora\. Tente de novo a partir das \d{2}:\d{2}\./);
  });
});

describe("refinar", () => {
  it("manda entrada, issue atual e ajuste, e lista as partes que mudaram", async () => {
    const depois = issueExemplo();
    depois.estados[0].status = "Disponível";
    depois.criterios[0].texto = "Com 3 cupons, o 4º é recusado com aviso.";
    const p = provedorFalso(JSON.stringify(depois));
    const a = await app({}, p);
    const cookie = await entrar(a);
    const r = await a.inject({
      method: "POST",
      url: "/api/refinar",
      headers: { cookie },
      payload: { entrada: ENTRADA, issue: issueExemplo(), ajuste: "Troque o status Ativo por Disponível" },
    });
    const final = r.body.split("\n\n").filter((b) => b.startsWith("event: resultado"))[0];
    const dados = JSON.parse(final.split("\n")[1].slice(6));
    expect(dados.alteracoes).toEqual(["Estados / Ciclo de vida", "Critérios de Aceite"]);
    expect(p.chamadas[0]).toContain("<issue_atual>");
    expect(p.chamadas[0]).toContain("<ajuste>\nTroque o status Ativo por Disponível\n</ajuste>");
    expect(p.chamadas[0]).toContain("<descricao>\nLimitar cupons a 3.\n</descricao>");
  });

  it("valida ajuste vazio, ajuste longo e issue fora do schema", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const casos: [object, number][] = [
      [{ entrada: ENTRADA, issue: issueExemplo(), ajuste: " " }, 400],
      [{ entrada: ENTRADA, issue: issueExemplo(), ajuste: "x".repeat(2001) }, 400],
      [{ entrada: ENTRADA, issue: { titulo: "x" }, ajuste: "ok" }, 400],
    ];
    for (const [payload, status] of casos) {
      expect((await a.inject({ method: "POST", url: "/api/refinar", headers: { cookie }, payload })).statusCode).toBe(status);
    }
  });

  it("aponta mudança nenhuma quando a issue volta igual", () => {
    expect(partesAlteradas(issueExemplo(), issueExemplo())).toEqual([]);
  });
});

describe("custo estimado", () => {
  it("calcula pelo preço da Claude e devolve null para modelo sem preço", () => {
    const uso = { entrada: 1000, saida: 5000, cacheLeitura: 20000, cacheEscrita: 0 };
    // 1000*4 + 5000*20 + 20000*0,2 = 108.000 / 1e6 = 0,108
    expect(custoEstimado("claude-opus-5-5", uso, null)).toBe(0.108);
    expect(custoEstimado("gemini-3.8-flash", uso, null)).toBeNull();
    expect(custoEstimado("gemini-3.8-flash", uso, lerPreco("1,2,0.1,0"))).toBe(0.013);
  });

  it("ignora PRECO_POR_MTOK malformado", () => {
    expect(lerPreco("")).toBeNull();
    expect(lerPreco("1,2,3")).toBeNull();
    expect(lerPreco("1,a,3,4")).toBeNull();
  });
});
