import { hkdfSync, randomBytes } from "node:crypto";

/**
 * Para que cada subchave serve. O nome entra no "info" do HKDF: chaves de usos diferentes saem
 * independentes, e vazar uma não revela as outras nem o SEGREDO_SESSAO.
 */
export type UsoChave = "sso-estado" | "mfa" | "mfa-desafio";

const SAL = Buffer.from("issue-doc-generator/v1", "utf8");

/**
 * Subchaves derivadas do SEGREDO_SESSAO por HKDF-SHA256 (RFC 5869), uma por uso. Sem segredo, usa
 * um aleatório deste processo (as subchaves mudam a cada reinício).
 */
export function criarChaves(segredo: string) {
  const base = segredo ? Buffer.from(segredo, "utf8") : randomBytes(32);
  const cache = new Map<UsoChave, Buffer>();
  return {
    segredoTemporario: !segredo,
    /** 32 bytes para o uso pedido; sempre a mesma enquanto o segredo não muda. */
    chave(uso: UsoChave): Buffer {
      let k = cache.get(uso);
      if (!k) {
        k = Buffer.from(hkdfSync("sha256", base, SAL, `issue-doc-generator/${uso}`, 32));
        cache.set(uso, k);
      }
      return k;
    },
  };
}

export type Chaves = ReturnType<typeof criarChaves>;
