import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { exigirAdmin, PREFIXOS_PUBLICOS, ROTAS_PUBLICAS, usuarioObrigatorio } from "../src/auth/acesso.js";
import { carregarConfig } from "../src/config.js";
import { registrarErros } from "../src/seguranca.js";
import { entrar, USUARIO_TESTE } from "./fixtures/login.js";

const COMUM = { email: "comum@exemplo.dev", senha: "senha-do-comum" };

type Rota = { metodo: string; url: string };
type App = Awaited<ReturnType<typeof montarApp>>;

function pastaWeb() {
  const dir = mkdtempSync(path.join(tmpdir(), "idg-web-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>t</title>");
  return dir;
}

/** Sobe o app como em produção (com a tela) e anota cada rota registrada. */
async function subir() {
  const rotas: Rota[] = [];
  const app = await montarApp(carregarConfig({ USUARIOS_PERMITIDOS: `${USUARIO_TESTE},${COMUM.email}:${COMUM.senha}`, ANTHROPIC_API_KEY: "sk-teste" }), {
    pastaWeb: pastaWeb(),
    aoRegistrarRota: (r) => {
      for (const metodo of [r.method].flat()) rotas.push({ metodo, url: r.url });
    },
  });
  await app.ready();
  return { app, rotas };
}

const ehApi = (url: string) => url === "/api" || url.startsWith("/api/");
const publica = (url: string) => ROTAS_PUBLICAS.includes(url) || PREFIXOS_PUBLICOS.some((p) => url.startsWith(p));

/** Troca os parâmetros do padrão por valores de exemplo: "/api/historico/:id" → "/api/historico/1". */
function concreta(url: string) {
  return url.replace(/:nome/g, "backup.db").replace(/:[a-z]+/gi, "1").replace(/\*/g, "x");
}

const hex = (c: string, maiuscula = false) => {
  const h = c.charCodeAt(0).toString(16);
  return `%${maiuscula ? h.toUpperCase() : h}`;
};

/** O mesmo caminho escrito de outros jeitos que um roteador pode (ou não) entender igual. */
function variacoes(caminho: string): string[] {
  const resto = caminho.slice("/api/".length);
  // Só a primeira barra depois de /api/ vira %2F (de propósito).
  const barra = resto.indexOf("/");
  const umaBarraCodificada = barra < 0 ? resto : `${resto.slice(0, barra)}%2F${resto.slice(barra + 1)}`;
  const tudoCodificado = resto
    .split("/")
    .map((parte) => [...parte].map((c) => hex(c, true)).join(""))
    .join("/");
  const lista = [
    caminho,
    `/api/${hex(resto[0])}${resto.slice(1)}`,
    `/api/${tudoCodificado}`,
    `/api%2F${resto}`,
    `/api%2f${resto}`,
    `/api/${umaBarraCodificada}`,
    caminho.toUpperCase(),
    `/api/${resto[0].toUpperCase()}${resto.slice(1)}`,
    `/API/${resto}`,
    `${caminho}/`,
    `/api//${resto}`,
    `/${caminho}`,
    `${caminho};x=1`,
    `/api;x=1/${resto}`,
    `/api/./${resto}`,
    `/api/x/../${resto}`,
    `${caminho}?x=1`,
    `${caminho}?`,
  ];
  return [...new Set(lista)];
}

/** Respostas aceitáveis para quem não pode entrar: nunca 2xx, 3xx nem 500. */
const NEGADO = [401, 403, 404];

async function pedir(app: App, metodo: string, url: string, cookie?: string) {
  const temCorpo = !["GET", "HEAD", "OPTIONS"].includes(metodo);
  return app.inject({
    method: metodo as "GET",
    url,
    headers: cookie ? { cookie } : {},
    ...(temCorpo ? { payload: { email: "invasor@exemplo.dev", senha: "senha-longa-de-teste", admin: true } } : {}),
  });
}

describe("autorização pela rota registrada", () => {
  let app: App;
  let rotas: Rota[];
  let comum: string;
  let admin: string;

  beforeAll(async () => {
    ({ app, rotas } = await subir());
    comum = await entrar(app, COMUM.email, COMUM.senha);
    admin = await entrar(app);
  });
  afterAll(() => app.close());

  const protegidas = () => rotas.filter((r) => ehApi(r.url) && !publica(r.url));
  const deAdmin = () => rotas.filter((r) => r.url === "/api/admin" || r.url.startsWith("/api/admin/"));

  it("a lista de rotas públicas é exatamente esta (rota pública nova exige mudar o teste)", () => {
    const publicas = [...new Set(rotas.filter((r) => ehApi(r.url) && publica(r.url)).map((r) => r.url))].sort();
    expect(publicas).toEqual([
      "/api/configurar",
      "/api/login",
      "/api/login/chave/concluir",
      "/api/login/chave/iniciar",
      "/api/login/mfa",
      "/api/publico/:token",
      "/api/sair",
      "/api/saude",
      "/api/sessao",
      "/api/sso/iniciar",
      "/api/sso/retorno",
    ]);
    // Nenhuma entrada sobrando na lista de públicas.
    for (const url of ROTAS_PUBLICAS) expect(rotas.some((r) => r.url === url), url).toBe(true);
  });

  it("toda rota /api que não é pública responde 401 sem login", async () => {
    expect(protegidas().length).toBeGreaterThan(20);
    expect(deAdmin().length).toBeGreaterThan(5);
    for (const r of protegidas()) {
      const resposta = await pedir(app, r.metodo, concreta(r.url));
      expect(resposta.statusCode, `${r.metodo} ${r.url}`).toBe(401);
      if (r.metodo !== "HEAD") expect(resposta.json().erro.codigo, `${r.metodo} ${r.url}`).toBe("nao_autenticado");
    }
  });

  it("toda rota de admin responde 403 para usuário comum", async () => {
    for (const r of deAdmin()) {
      const resposta = await pedir(app, r.metodo, concreta(r.url), comum);
      expect(resposta.statusCode, `${r.metodo} ${r.url}`).toBe(403);
    }
  });

  it("variações do caminho (encoding, maiúsculas, barras, ;param, ?query) não passam sem login", async () => {
    for (const r of protegidas()) {
      for (const url of variacoes(concreta(r.url))) {
        const resposta = await pedir(app, r.metodo, url);
        expect(NEGADO, `${r.metodo} ${url} → ${resposta.statusCode}`).toContain(resposta.statusCode);
      }
    }
  });

  it("variações do caminho de admin não passam com usuário comum", async () => {
    for (const r of deAdmin()) {
      for (const url of variacoes(concreta(r.url))) {
        const resposta = await pedir(app, r.metodo, url, comum);
        expect(NEGADO, `${r.metodo} ${url} → ${resposta.statusCode}`).toContain(resposta.statusCode);
      }
    }
  });

  it("caminho com percent-encoding não cria usuário sem login nem com usuário comum", async () => {
    const novo = { email: "intruso@exemplo.dev", senha: "senha-longa-de-teste", admin: true };
    for (const cookie of [undefined, comum]) {
      for (const url of ["/api/%61dmin/usuarios", "/api/%61%64%6D%69%6E/usuarios", "/api/admin/%75suarios"]) {
        const r = await app.inject({ method: "POST", url, payload: novo, headers: cookie ? { cookie } : {} });
        expect(NEGADO, `${url} → ${r.statusCode}`).toContain(r.statusCode);
      }
    }
    const lista = await app.inject({ method: "GET", url: "/api/admin/usuarios", headers: { cookie: admin } });
    expect(lista.statusCode).toBe(200);
    expect((lista.json().usuarios as { email: string }[]).map((u) => u.email)).not.toContain(novo.email);
  });

  it("caminho com percent-encoding não lista usuários nem o histórico sem login", async () => {
    for (const url of ["/api/%61dmin/usuarios", "/api/%68istorico", "/api/%68istorico/1"]) {
      const r = await app.inject({ method: "GET", url });
      expect(r.statusCode, url).toBe(401);
      expect(r.body).not.toContain("@exemplo.dev");
    }
  });

  it("o caminho certo continua funcionando para quem pode", async () => {
    expect((await app.inject({ method: "GET", url: "/api/admin/usuarios", headers: { cookie: admin } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/%61dmin/usuarios", headers: { cookie: admin } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/historico", headers: { cookie: comum } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/saude" })).statusCode).toBe(200);
  });

  it("caminho da API que não existe responde 404 em JSON, não a tela", async () => {
    for (const url of ["/api/nao-existe", "/API/ADMIN/USUARIOS", "/api%2Fadmin/usuarios", "/api/admin/usuarios/"]) {
      const r = await app.inject({ method: "GET", url });
      expect(r.statusCode, url).toBe(404);
      expect(r.headers["content-type"], url).toContain("application/json");
    }
  });
});

describe("defesa em profundidade", () => {
  async function appIsolado(usuario?: { email: string; nome: string; admin: boolean }) {
    const app = Fastify();
    registrarErros(app);
    app.addHook("onRequest", async (request) => {
      request.usuario = usuario;
    });
    app.get("/precisa-de-usuario", async (request) => ({ email: usuarioObrigatorio(request).email }));
    await app.register(async (admin) => {
      exigirAdmin(admin);
      admin.get("/so-admin", async () => ({ ok: true }));
    });
    return app;
  }

  it("rota sem usuário responde 401 no formato da API, não 500", async () => {
    const app = await appIsolado();
    const r = await app.inject({ method: "GET", url: "/precisa-de-usuario" });
    expect(r.statusCode).toBe(401);
    expect(r.json().erro.codigo).toBe("nao_autenticado");
    await app.close();
  });

  it("o plugin de admin barra sozinho quem não tem sessão ou não é admin", async () => {
    const semSessao = await appIsolado();
    expect((await semSessao.inject({ method: "GET", url: "/so-admin" })).statusCode).toBe(401);
    await semSessao.close();

    const comum = await appIsolado({ email: COMUM.email, nome: "comum", admin: false });
    const r = await comum.inject({ method: "GET", url: "/so-admin" });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro.codigo).toBe("sem_permissao");
    await comum.close();

    const adm = await appIsolado({ email: "qa@exemplo.dev", nome: "qa", admin: true });
    expect((await adm.inject({ method: "GET", url: "/so-admin" })).statusCode).toBe(200);
    await adm.close();
  });
});
