import { describe, expect, it } from "vitest";
import { montarApp } from "../src/app.js";
import { Limitador } from "../src/auth/limite.js";
import { carregarConfig, lerConfiancaProxy } from "../src/config.js";
import { EMAIL_TESTE, entrar, SENHA_TESTE, USUARIO_TESTE } from "./fixtures/login.js";

// IPs de documentação (RFC 5737): 203.0.113.x é o cliente real visto pelo proxy; 10.x é o que o
// cliente escreve por conta própria no X-Forwarded-For.
const IP_REAL = "203.0.113.5";

async function app(confiarProxy: string) {
  return montarApp(carregarConfig({ USUARIOS_PERMITIDOS: USUARIO_TESTE, CONFIAR_PROXY: confiarProxy }));
}

/** Como o nginx com $proxy_add_x_forwarded_for: o que o cliente mandou, mais o IP que o proxy viu. */
const viaProxy = (doCliente: string, real = IP_REAL) => ({ "x-forwarded-for": `${doCliente}, ${real}` });

async function loginErrado(a: Awaited<ReturnType<typeof app>>, usuario: string, headers: Record<string, string>) {
  return a.inject({ method: "POST", url: "/api/login", headers, payload: { usuario, senha: "senha-errada" } });
}

describe("CONFIAR_PROXY", () => {
  it("aceita false, true (1 salto), número de saltos e lista de IP/CIDR", () => {
    expect(lerConfiancaProxy("")).toBe(false);
    expect(lerConfiancaProxy("false")).toBe(false);
    expect(lerConfiancaProxy("true")).toBe(1);
    expect(lerConfiancaProxy("2")).toBe(2);
    expect(lerConfiancaProxy("127.0.0.1, 10.0.0.0/8, fd00::/8")).toEqual(["127.0.0.1", "10.0.0.0/8", "fd00::/8"]);
    expect(lerConfiancaProxy("sim")).toBeNull();
    expect(lerConfiancaProxy("10.0.0.0/33")).toBeNull();
    expect(lerConfiancaProxy("10.0.0.300")).toBeNull();
  });

  it("valor inválido impede a subida com uma mensagem clara", () => {
    expect(() => carregarConfig({ CONFIAR_PROXY: "talvez" })).toThrow(/CONFIAR_PROXY/);
  });

  it("com true, X-Forwarded-For forjado a cada pedido não dribla o limite de login por IP", async () => {
    const a = await app("true");
    const status: number[] = [];
    for (let i = 1; i <= 11; i++) {
      // Contas diferentes a cada vez, para o teste medir só o limite por IP.
      status.push((await loginErrado(a, `conta${i}@exemplo.dev`, viaProxy(`10.0.0.${i}`))).statusCode);
    }
    expect(status.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(status[10]).toBe(429);
    await a.close();
  });

  it("a auditoria guarda o IP do último salto confiável, não o que o cliente escreveu", async () => {
    const a = await app("true");
    await loginErrado(a, "ninguem@exemplo.dev", viaProxy("10.9.9.9"));
    const admin = await entrar(a);
    const r = await a.inject({ method: "GET", url: "/api/admin/auditoria?acao=login_falhou", headers: { cookie: admin } });
    const eventos = r.json().eventos as { ip: string }[];
    expect(eventos.map((e) => e.ip)).toEqual([IP_REAL]);
    await a.close();
  });

  it("com o número de saltos, conta da direita para a esquerda", async () => {
    const a = await app("2");
    await loginErrado(a, "ninguem@exemplo.dev", { "x-forwarded-for": "10.9.9.9, 198.51.100.7, 10.0.0.2" });
    const admin = await entrar(a);
    const r = await a.inject({ method: "GET", url: "/api/admin/auditoria?acao=login_falhou", headers: { cookie: admin } });
    expect((r.json().eventos as { ip: string }[]).map((e) => e.ip)).toEqual(["198.51.100.7"]);
    await a.close();
  });

  it("com a lista de IPs, só confia nos proxies listados", async () => {
    const a = await app("127.0.0.1");
    await loginErrado(a, "ninguem@exemplo.dev", viaProxy("10.9.9.9", "198.51.100.8"));
    const admin = await entrar(a);
    const r = await a.inject({ method: "GET", url: "/api/admin/auditoria?acao=login_falhou", headers: { cookie: admin } });
    expect((r.json().eventos as { ip: string }[]).map((e) => e.ip)).toEqual(["198.51.100.8"]);
    await a.close();
  });

  it("com false, o X-Forwarded-For é ignorado", async () => {
    const a = await app("false");
    await loginErrado(a, "ninguem@exemplo.dev", viaProxy("10.9.9.9"));
    const admin = await entrar(a);
    const r = await a.inject({ method: "GET", url: "/api/admin/auditoria?acao=login_falhou", headers: { cookie: admin } });
    expect((r.json().eventos as { ip: string }[]).map((e) => e.ip)).toEqual(["127.0.0.1"]);
    await a.close();
  });
});

describe("limite de login por conta", () => {
  it("trava a conta mesmo com os pedidos vindo de IPs diferentes, inclusive com a senha certa", async () => {
    const a = await app("true");
    for (let i = 1; i <= 10; i++) {
      const r = await loginErrado(a, EMAIL_TESTE, viaProxy("10.0.0.1", `203.0.113.${i}`));
      expect(r.statusCode).toBe(401);
    }
    // Mesma conta escrita com maiúsculas e de outro IP: continua travada.
    const certa = await a.inject({
      method: "POST",
      url: "/api/login",
      headers: viaProxy("10.0.0.1", "203.0.113.50"),
      payload: { usuario: EMAIL_TESTE.toUpperCase(), senha: SENHA_TESTE },
    });
    expect(certa.statusCode).toBe(429);
    expect(certa.json().erro.mensagem).toBe("Muitas tentativas de login. Aguarde alguns minutos.");
    await a.close();
  });

  it("um login certo zera as tentativas da conta", async () => {
    const a = await app("true");
    for (let i = 1; i <= 9; i++) await loginErrado(a, EMAIL_TESTE, viaProxy("10.0.0.1", `203.0.113.${i}`));
    await entrar(a);
    for (let i = 1; i <= 9; i++) {
      expect((await loginErrado(a, EMAIL_TESTE, viaProxy("10.0.0.1", `198.51.100.${i}`))).statusCode).toBe(401);
    }
    await a.close();
  });
});

describe("Limitador", () => {
  it("descarta as chaves vencidas ao podar", () => {
    const l = new Limitador(3, 1000);
    l.tentar("a", 0);
    l.tentar("b", 500);
    l.podar(1200);
    expect(l.tamanho).toBe(1);
    expect(l.tentar("b", 1200).ok).toBe(true);
  });
});
