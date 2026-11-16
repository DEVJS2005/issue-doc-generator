import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Senhas guardadas só como hash scrypt com sal aleatório: "scrypt$N$r$p$sal$hash" (base64).
const N = 16384;
const R = 8;
const P = 1;
const TAMANHO = 32;

export const SENHA_MINIMA = 8;

export function gerarHash(senha: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, TAMANHO, { N, r: R, p: P });
  return ["scrypt", N, R, P, sal.toString("base64"), hash.toString("base64")].join("$");
}

export function conferirSenha(senha: string, guardado: string): boolean {
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, "base64");
  const calculado = scryptSync(senha, Buffer.from(salB64, "base64"), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Hash de uma senha que ninguém conhece: compara mesmo quando o e-mail não existe (mesmo tempo). */
export const HASH_INEXISTENTE = gerarHash(randomBytes(24).toString("hex"));
