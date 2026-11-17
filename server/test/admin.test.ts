import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { DatabaseSync } from "node:sqlite";
import { abrirBanco, MIGRACAO_NOME } from "../src/banco/banco.js";
import { RepositorioHistorico } from "../src/banco/historico.js";
import { carregarConfig, type Config } from "../src/config.js";
import type { Provedor } from "../src/ia/tipos.js";
import { issueExemplo } from "./fixtures/issue.js";
import { EMAIL_TESTE, entrar, SENHA_TESTE, USUARIO_TESTE } from "./fixtures/login.js";

const ENTRADA = { descricao: "Limitar cupons a 3.", tipo: "Melhoria", produto: "Loja", contexto: "" };
const CODIGO = "codigo-de-teste-123";

/** Provedor falso por modelo: "cai-503" simula sobrecarga; os outros devolvem a issue de exemplo. */
function fabrica(chamadas: string[] = []) {
  return (c: Config): Provedor => ({
    nome: c.provedor,
    modelo: c.modelo,
    async gerar() {
      chamadas.push(`${c.provedor}/${c.modelo}`);
      if (c.modelo === "cai-503") throw Object.assign(new Error("503 high demand"), { status: 503 });
      return { texto: JSON.stringify(issueExemplo()), modelo: c.modelo, usouFallback: false, uso: { entrada: 1, saida: 1, cacheLeitura: 0, cacheEscrita: 0 } };
    },
  });
}

async function app(env: NodeJS.ProcessEnv = {}, chamadas: string[] = []) {
  return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE, ANTHROPIC_API_KEY: "sk-teste", ...env }), {
    fabricaProvedor: fabrica(chamadas),
    codigoConfiguracao: CODIGO,
  });
}

function ultimoEvento(corpo: string) {
  const bloco = corpo.split("\n\n").filter((b) => b.startsWith("event:")).at(-1)!;
  const [ev, dados] = bloco.split("\n");
  return { evento: ev.slice(7), dados: JSON.parse(dados.slice(6)) };
}

describe("configuração inicial (banco sem usuários)", () => {
  it("cria o primeiro admin só com o código do log, uma vez", async () => {
    const a = await app({ USUARIOS_PERMITIDOS: "" });
    const sessao = await a.inject({ method: "GET", url: "/api/sessao" });
    expect(sessao.statusCode).toBe(401);
    expect(sessao.json().precisaConfigurar).toBe(true);

    const errado = await a.inject({ method: "POST", url: "/api/configurar", payload: { codigo: "outro", email: "admin@exemplo.dev", senha: "senha-forte-1" } });
    expect(errado.statusCode).toBe(403);
    const curta = await a.inject({ method: "POST", url: "/api/configurar", payload: { codigo: CODIGO, email: "admin@exemplo.dev", senha: "curta" } });
    expect(curta.json().erro.mensagem).toBe("A senha precisa ter pelo menos 8 caracteres.");

    const ok = await a.inject({ method: "POST", url: "/api/configurar", payload: { codigo: CODIGO, email: "Admin@Exemplo.dev", senha: "senha-forte-1" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ usuario: { email: "admin@exemplo.dev", nome: "admin", admin: true } });
    expect(String(ok.headers["set-cookie"])).toContain("HttpOnly");

    const denovo = await a.inject({ method: "POST", url: "/api/configurar", payload: { codigo: CODIGO, email: "outro@exemplo.dev", senha: "senha-forte-2" } });
    expect(denovo.statusCode).toBe(409);
    expect((await a.inject({ method: "GET", url: "/api/sessao" })).json().precisaConfigurar).toBe(false);
  });
});

describe("administração", () => {
  it("só admin abre /api/admin (403 para os demais, 401 sem login)", async () => {
    const a = await app({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},comum@exemplo.dev:senha-comum` });
    expect((await a.inject({ method: "GET", url: "/api/admin/ajustes" })).statusCode).toBe(401);
    const comum = await entrar(a, "comum@exemplo.dev", "senha-comum");
    expect((await a.inject({ method: "GET", url: "/api/admin/ajustes", headers: { cookie: comum } })).statusCode).toBe(403);
    const admin = await entrar(a);
    expect((await a.inject({ method: "GET", url: "/api/admin/ajustes", headers: { cookie: admin } })).statusCode).toBe(200);
  });

  it("mostra quais provedores têm chave", async () => {
    const a = await app({ GEMINI_API_KEY: "chave-gemini" });
    const r = await a.inject({ method: "GET", url: "/api/admin/ajustes", headers: { cookie: await entrar(a) } });
    const disponiveis = Object.fromEntries(r.json().provedores.map((p: { nome: string; disponivel: boolean }) => [p.nome, p.disponivel]));
    expect(disponiveis).toEqual({ anthropic: true, openai: false, openai_compativel: false, gemini: true });
    expect(r.json().valores).toMatchObject({ provedor: "anthropic", modelo: "claude-opus-5-5", modeloReserva: "", retencaoDias: 180 });
  });

  it("troca provedor e modelo sem reiniciar e registra quem mudou", async () => {
    const chamadas: string[] = [];
    const a = await app({ GEMINI_API_KEY: "chave-gemini" }, chamadas);
    const cookie = await entrar(a);
    const salvar = (payload: object) => a.inject({ method: "PUT", url: "/api/admin/ajustes", headers: { cookie }, payload });

    expect((await salvar({ provedor: "openai", modelo: "x" })).json().erro.mensagem).toBe("Sem OPENAI_API_KEY no .env.");
    expect((await salvar({ provedor: "gemini", modelo: "" })).json().erro.mensagem).toBe("Informe o modelo do provedor Gemini (Google).");

    const ok = await salvar({ provedor: "gemini", modelo: "gemini-teste", esforco: "low" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().alteracoes.map((x: { chave: string; quem: string }) => `${x.quem}:${x.chave}`).sort()).toEqual(
      [`${EMAIL_TESTE}:esforco`, `${EMAIL_TESTE}:modelo`, `${EMAIL_TESTE}:provedor`].sort(),
    );
    expect((await a.inject({ method: "GET", url: "/api/saude" })).json()).toEqual({ ok: true, provedor: "gemini", modelo: "gemini-teste" });

    await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: ENTRADA });
    expect(chamadas.at(-1)).toBe("gemini/gemini-teste");
  });

  it("valida limites e o modelo reserva", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const salvar = (payload: object) => a.inject({ method: "PUT", url: "/api/admin/ajustes", headers: { cookie }, payload });
    expect((await salvar({ limitePorHora: 0 })).json().erro.mensagem).toBe("O limite por hora vai de 1 a 1.000.");
    expect((await salvar({ tempoLimiteSegundos: 10 })).json().erro.mensagem).toBe("O tempo limite vai de 30 a 1.800 segundos.");
    expect((await salvar({ retencaoDias: 0 })).json().erro.mensagem).toBe("A retenção vai de 1 a 3.650 dias.");
    expect((await salvar({ modeloReserva: "claude-opus-5-5" })).json().erro.mensagem).toBe("O modelo reserva precisa ser diferente do modelo principal.");
  });

  it("o novo limite por hora vale na hora", async () => {
    const a = await app();
    const cookie = await entrar(a);
    await a.inject({ method: "PUT", url: "/api/admin/ajustes", headers: { cookie }, payload: { limitePorHora: 1 } });
    expect((await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: ENTRADA })).statusCode).toBe(200);
    expect((await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: ENTRADA })).statusCode).toBe(429);
  });

  it("guarda os ajustes no arquivo SQLite e os recupera ao reiniciar", async () => {
    const arquivo = path.join(mkdtempSync(path.join(tmpdir(), "idg-")), "dados", "banco.db");
    const a1 = await app({ ARQUIVO_BANCO: arquivo });
    await a1.inject({ method: "PUT", url: "/api/admin/ajustes", headers: { cookie: await entrar(a1) }, payload: { modelo: "claude-outro", retencaoDias: 30 } });
    await a1.close();

    const a2 = await app({ ARQUIVO_BANCO: arquivo, USUARIOS_PERMITIDOS: "" });
    const r = await a2.inject({ method: "GET", url: "/api/admin/ajustes", headers: { cookie: await entrar(a2) } });
    expect(r.json().valores).toMatchObject({ modelo: "claude-outro", retencaoDias: 30 });
    await a2.close();
  });

  it("listar modelos: provedor inválido e provedor sem chave", async () => {
    const a = await app();
    const cookie = await entrar(a);
    expect((await a.inject({ method: "GET", url: "/api/admin/modelos?provedor=xyz", headers: { cookie } })).statusCode).toBe(400);
    const r = await a.inject({ method: "GET", url: "/api/admin/modelos?provedor=gemini", headers: { cookie } });
    expect(r.statusCode).toBe(502);
    expect(r.json().erro.codigo).toBe("nao_configurado");
  });
});

describe("modelo reserva", () => {
  it("quando o principal dá 503, a geração sai pelo reserva", async () => {
    const chamadas: string[] = [];
    const a = await app({}, chamadas);
    const cookie = await entrar(a);
    await a.inject({ method: "PUT", url: "/api/admin/ajustes", headers: { cookie }, payload: { modelo: "cai-503", modeloReserva: "claude-reserva" } });
    const r = ultimoEvento((await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: ENTRADA })).body);
    expect(r.evento).toBe("resultado");
    expect(r.dados).toMatchObject({ modelo: "claude-reserva", usouFallback: true });
    expect(chamadas).toEqual(["anthropic/cai-503", "anthropic/claude-reserva"]);
  });

  it("sem reserva, o 503 vira a mensagem de provedor instável", async () => {
    const a = await app();
    const cookie = await entrar(a);
    await a.inject({ method: "PUT", url: "/api/admin/ajustes", headers: { cookie }, payload: { modelo: "cai-503" } });
    const r = ultimoEvento((await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie }, payload: ENTRADA })).body);
    expect(r).toMatchObject({ evento: "erro", dados: { codigo: "servidor" } });
  });
});

describe("usuários", () => {
  it("cria, recusa duplicado e senha curta, desativa e corta a sessão", async () => {
    const a = await app();
    const admin = await entrar(a);
    const criar = (payload: object) => a.inject({ method: "POST", url: "/api/admin/usuarios", headers: { cookie: admin }, payload });

    const novo = await criar({ email: "bia@exemplo.dev", senha: "senha-da-bia", admin: false });
    expect(novo.statusCode).toBe(201);
    expect((await criar({ email: "BIA@exemplo.dev", senha: "outra-senha", admin: false })).statusCode).toBe(409);
    expect((await criar({ email: "ze@exemplo.dev", senha: "curta" })).json().erro.mensagem).toBe("A senha precisa ter pelo menos 8 caracteres.");
    expect((await criar({ email: "nao-e-email", senha: "senha-valida" })).json().erro.mensagem).toBe("Informe um e-mail válido.");

    const bia = await entrar(a, "bia@exemplo.dev", "senha-da-bia");
    expect((await a.inject({ method: "GET", url: "/api/opcoes", headers: { cookie: bia } })).statusCode).toBe(200);
    const id = novo.json().usuario.id;
    await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${id}`, headers: { cookie: admin }, payload: { ativo: false } });
    expect((await a.inject({ method: "GET", url: "/api/opcoes", headers: { cookie: bia } })).statusCode).toBe(401);
    expect((await a.inject({ method: "POST", url: "/api/login", payload: { email: "bia@exemplo.dev", senha: "senha-da-bia" } })).statusCode).toBe(401);
  });

  it("nunca deixa o sistema sem administrador ativo", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const lista = (await a.inject({ method: "GET", url: "/api/admin/usuarios", headers: { cookie } })).json().usuarios;
    const eu = lista.find((u: { email: string }) => u.email === EMAIL_TESTE);
    const r = await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${eu.id}`, headers: { cookie }, payload: { admin: false } });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toBe("É preciso manter pelo menos um administrador ativo.");
  });

  it("troca a senha de um usuário", async () => {
    const a = await app();
    const admin = await entrar(a);
    const novo = await a.inject({ method: "POST", url: "/api/admin/usuarios", headers: { cookie: admin }, payload: { email: "ca@exemplo.dev", senha: "senha-antiga" } });
    await a.inject({ method: "PATCH", url: `/api/admin/usuarios/${novo.json().usuario.id}`, headers: { cookie: admin }, payload: { senha: "senha-nova-1" } });
    expect((await a.inject({ method: "POST", url: "/api/login", payload: { email: "ca@exemplo.dev", senha: "senha-antiga" } })).statusCode).toBe(401);
    expect((await a.inject({ method: "POST", url: "/api/login", payload: { email: "ca@exemplo.dev", senha: "senha-nova-1" } })).statusCode).toBe(200);
  });
});

describe("histórico de issues", () => {
  it("guarda a geração, cada um vê as suas e o admin vê todas", async () => {
    const a = await app({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},comum@exemplo.dev:senha-comum` });
    const comum = await entrar(a, "comum@exemplo.dev", "senha-comum");
    const admin = await entrar(a, EMAIL_TESTE, SENHA_TESTE);

    const r = ultimoEvento((await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie: comum }, payload: ENTRADA })).body);
    const id = r.dados.historicoId;
    expect(id).toBeGreaterThan(0);

    const minhas = (await a.inject({ method: "GET", url: "/api/historico", headers: { cookie: comum } })).json();
    expect(minhas.itens.map((i: { id: number }) => i.id)).toEqual([id]);
    expect(minhas.podeVerTodos).toBe(false);
    expect((await a.inject({ method: "GET", url: "/api/historico", headers: { cookie: admin } })).json().itens).toEqual([]);
    const todas = (await a.inject({ method: "GET", url: "/api/historico?todos=1", headers: { cookie: admin } })).json();
    expect(todas.itens[0]).toMatchObject({ id, usuario: "comum@exemplo.dev", titulo: "Limitar cupons por pedido", produto: "Loja", versoes: 1 });

    const item = (await a.inject({ method: "GET", url: `/api/historico/${id}`, headers: { cookie: comum } })).json();
    expect(item.item.entrada).toEqual(ENTRADA);
    expect(item.item.markdown).toContain("# Limitar cupons por pedido");
  });

  it("refinar uma issue do histórico cria a versão 2; outra pessoa não acessa", async () => {
    const a = await app({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},comum@exemplo.dev:senha-comum,outro@exemplo.dev:senha-outro` });
    const comum = await entrar(a, "comum@exemplo.dev", "senha-comum");
    const outro = await entrar(a, "outro@exemplo.dev", "senha-outro");
    const id = ultimoEvento((await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie: comum }, payload: ENTRADA })).body).dados.historicoId;

    const ref = ultimoEvento(
      (
        await a.inject({
          method: "POST",
          url: "/api/refinar",
          headers: { cookie: comum },
          payload: { entrada: ENTRADA, issue: issueExemplo(), ajuste: "Prioridade Alta", historicoId: id },
        })
      ).body,
    );
    expect(ref.dados.historicoId).toBe(id);
    const versoes = (await a.inject({ method: "GET", url: `/api/historico/${id}`, headers: { cookie: comum } })).json().versoes;
    expect(versoes.map((v: { numero: number; ajuste: string | null }) => [v.numero, v.ajuste])).toEqual([
      [1, null],
      [2, "Prioridade Alta"],
    ]);

    expect((await a.inject({ method: "GET", url: `/api/historico/${id}`, headers: { cookie: outro } })).statusCode).toBe(404);
    expect((await a.inject({ method: "DELETE", url: `/api/historico/${id}`, headers: { cookie: outro } })).statusCode).toBe(404);
    expect((await a.inject({ method: "DELETE", url: `/api/historico/${id}`, headers: { cookie: comum } })).statusCode).toBe(200);
    expect((await a.inject({ method: "GET", url: "/api/historico", headers: { cookie: comum } })).json().itens).toEqual([]);
  });

  it("a retenção apaga só as issues mais antigas que o prazo", () => {
    const h = new RepositorioHistorico(abrirBanco(":memory:"));
    const dia = 86_400_000;
    const agora = Date.now();
    const velha = h.salvarNova("a@x.dev", ENTRADA as never, issueExemplo(), "# x", "m", agora - 200 * dia);
    const nova = h.salvarNova("a@x.dev", ENTRADA as never, issueExemplo(), "# y", "m", agora - 10 * dia);
    expect(h.expurgar(180, agora)).toBe(1);
    expect(h.obter(velha)).toBeNull();
    expect(h.obter(nova)).not.toBeNull();
  });
});

describe("nome de usuário", () => {
  it("entra pelo nome (sem diferenciar maiúsculas) ou pelo e-mail", async () => {
    const a = await app();
    for (const usuario of ["qa", "QA", EMAIL_TESTE]) {
      const r = await a.inject({ method: "POST", url: "/api/login", payload: { usuario, senha: SENHA_TESTE } });
      expect(r.statusCode, usuario).toBe(200);
      expect(r.json().usuario).toEqual({ email: EMAIL_TESTE, nome: "qa", admin: true });
    }
    expect((await a.inject({ method: "POST", url: "/api/login", payload: { usuario: "qa", senha: "errada" } })).json().erro.mensagem).toBe("Usuário ou senha incorretos.");
  });

  it("cria com nome, recusa nome repetido ou inválido e troca o nome", async () => {
    const a = await app();
    const cookie = await entrar(a);
    const criar = (payload: object) => a.inject({ method: "POST", url: "/api/admin/usuarios", headers: { cookie }, payload });
    const bia = await criar({ nome: "bia.lima", email: "bia@exemplo.dev", senha: "senha-da-bia" });
    expect(bia.json().usuario).toMatchObject({ nome: "bia.lima", email: "bia@exemplo.dev" });
    expect((await criar({ nome: "Bia.Lima", email: "outra@exemplo.dev", senha: "senha-outra" })).statusCode).toBe(409);
    expect((await criar({ nome: "tem espaço", email: "x@exemplo.dev", senha: "senha-valida" })).json().erro.mensagem).toMatch(/nome de usuário deve ter/);
    expect((await criar({ email: "qa@outro.dev", senha: "senha-valida" })).json().usuario.nome).toBe("qa-2");

    const id = bia.json().usuario.id;
    const r = await a.inject({ method: "PATCH", url: "/api/admin/usuarios/" + id, headers: { cookie }, payload: { nome: "beatriz" } });
    expect(r.json().usuario.nome).toBe("beatriz");
    expect((await a.inject({ method: "POST", url: "/api/login", payload: { usuario: "beatriz", senha: "senha-da-bia" } })).statusCode).toBe(200);
  });

  it("a migração dá um nome a quem já existia, sem repetir", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE usuarios (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, senha_hash TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL)");
    db.exec("INSERT INTO usuarios (email, senha_hash, criado_em, atualizado_em) VALUES ('ana@a.dev', 'x', 0, 0), ('Ana@b.dev', 'x', 0, 0), ('joao@a.dev', 'x', 0, 0)");
    db.exec(MIGRACAO_NOME);
    expect(db.prepare("SELECT nome FROM usuarios ORDER BY id").all().map((l) => (l as { nome: string }).nome)).toEqual(["ana", "ana-2", "joao"]);
  });

  it("o histórico mostra o nome do autor e o admin filtra pelo nome", async () => {
    const a = await app({ USUARIOS_PERMITIDOS: USUARIO_TESTE + ",comum@exemplo.dev:senha-comum" });
    const comum = await entrar(a, "comum@exemplo.dev", "senha-comum");
    await a.inject({ method: "POST", url: "/api/gerar", headers: { cookie: comum }, payload: ENTRADA });
    const admin = await entrar(a);
    const r = (await a.inject({ method: "GET", url: "/api/historico?todos=1&usuario=comum", headers: { cookie: admin } })).json();
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ usuario: "comum@exemplo.dev", autor: "comum" });
  });
});
