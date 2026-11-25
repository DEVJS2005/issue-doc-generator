import { describe, expect, it } from "vitest";
import { base32, codigoDoPasso, conferirCodigo, deBase32, gerarSegredo, uriOtpauth } from "../src/auth/totp.js";

describe("TOTP (RFC 6238)", () => {
  const segredo = Buffer.from("12345678901234567890");

  it("bate com os vetores de teste da RFC 6238 (SHA1, 8 dígitos)", () => {
    const vetores: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [t, esperado] of vetores) expect(codigoDoPasso(segredo, Math.floor(t / 30), 8), String(t)).toBe(esperado);
  });

  it("aceita o passo vizinho (relógio um pouco fora) e recusa um código já usado ou de longe", () => {
    const b32 = base32(segredo);
    const agora = 1_111_111_111_000;
    const passo = Math.floor(agora / 30_000);
    const doAnterior = codigoDoPasso(segredo, passo - 1);
    expect(conferirCodigo(b32, doAnterior, agora)).toBe(passo - 1);
    expect(conferirCodigo(b32, doAnterior, agora, passo - 1)).toBeNull();
    expect(conferirCodigo(b32, codigoDoPasso(segredo, passo - 3), agora)).toBeNull();
    expect(conferirCodigo(b32, "12345", agora)).toBeNull();
    expect(conferirCodigo(b32, "abcdef", agora)).toBeNull();
  });

  it("base32 vai e volta, e o segredo novo tem 160 bits", () => {
    expect(base32(segredo)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(deBase32("gezd gnbv-gy3t qojq gezd gnbv gy3t qojq").equals(segredo)).toBe(true);
    expect(deBase32(gerarSegredo())).toHaveLength(20);
  });

  it("o endereço otpauth tem o emissor, a conta e os parâmetros padrão", () => {
    expect(uriOtpauth("ABC", "qa@exemplo.dev")).toBe(
      "otpauth://totp/Issue%20Doc%20Generator%3Aqa%40exemplo.dev?secret=ABC&issuer=Issue+Doc+Generator&algorithm=SHA1&digits=6&period=30",
    );
  });
});
