import { createHmac, hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { criarChaves } from "../src/auth/chaves.js";
import { criarSessoes } from "../src/auth/sessao.js";

describe("subchaves derivadas do SEGREDO_SESSAO (HKDF)", () => {
  it("cada uso tem a própria chave de 32 bytes, sempre a mesma para o mesmo segredo", () => {
    const a = criarChaves("segredo-de-teste");
    const b = criarChaves("segredo-de-teste");
    expect(a.chave("sso-estado")).toHaveLength(32);
    expect(a.chave("sso-estado").equals(b.chave("sso-estado"))).toBe(true);
    expect(a.chave("mfa").equals(b.chave("mfa"))).toBe(true);
    expect(a.chave("sso-estado").equals(a.chave("mfa"))).toBe(false);
  });

  it("segredos diferentes dão chaves diferentes, e nenhuma é o próprio segredo", () => {
    const a = criarChaves("segredo-de-teste");
    const b = criarChaves("outro-segredo");
    expect(a.chave("mfa").equals(b.chave("mfa"))).toBe(false);
    expect(a.chave("mfa").includes(Buffer.from("segredo-de-teste"))).toBe(false);
  });

  it("é o HKDF-SHA256 da RFC 5869, com sal e info fixos (dá para reproduzir fora do servidor)", () => {
    const esperado = Buffer.from(hkdfSync("sha256", Buffer.from("segredo-de-teste"), Buffer.from("issue-doc-generator/v1"), "issue-doc-generator/mfa", 32));
    expect(criarChaves("segredo-de-teste").chave("mfa").equals(esperado)).toBe(true);
  });

  it("sem segredo, a chave é aleatória e muda a cada processo", () => {
    const a = criarChaves("");
    const b = criarChaves("");
    expect(a.segredoTemporario).toBe(true);
    expect(a.chave("sso-estado").equals(b.chave("sso-estado"))).toBe(false);
  });

  it("o selo do SSO usa a subchave: um selo assinado direto com o segredo não abre", () => {
    const s = criarSessoes(criarChaves("segredo-de-teste").chave("sso-estado"), 12);
    expect(s.abrir(s.selar({ nonce: "n1" }, 60_000, 1_000), 2_000)).toEqual({ nonce: "n1" });
    // Formato de antes desta mudança: HMAC com o SEGREDO_SESSAO cru.
    const corpo = Buffer.from(JSON.stringify({ d: { nonce: "n1" }, e: 61_000 })).toString("base64url");
    const antigo = `${corpo}.${createHmac("sha256", "segredo-de-teste").update(`selo:${corpo}`).digest("base64url")}`;
    expect(s.abrir(antigo, 2_000)).toBeNull();
  });
});
