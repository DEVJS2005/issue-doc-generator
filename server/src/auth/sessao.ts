import { createHmac, timingSafeEqual } from "node:crypto";

/** Nome do cookie em HTTP (desenvolvimento) e em HTTPS, com o prefixo que o navegador protege. */
export const COOKIE_SESSAO = "idg_sessao";
export const COOKIE_SESSAO_HTTPS = "__Host-idg_sessao";

/**
 * Selo assinado com HMAC-SHA256 para dados curtos e com validade, como o estado do login único
 * (SSO). A sessão de login não usa mais isto: fica no banco (banco/sessoes.ts). A chave é a
 * subchave "sso-estado", derivada do SEGREDO_SESSAO (auth/chaves.ts).
 */
export function criarSessoes(chave: Buffer, horas: number) {
  const assinar = (dados: string) => createHmac("sha256", chave).update(dados).digest("base64url");

  return {
    maxAgeSegundos: Math.round(horas * 3600),

    /** Sela dados curtos (ex.: estado do SSO) num token assinado e com validade. */
    selar(dados: object, validadeMs: number, agora = Date.now()): string {
      const corpo = Buffer.from(JSON.stringify({ d: dados, e: agora + validadeMs })).toString("base64url");
      return `${corpo}.${assinar(`selo:${corpo}`)}`;
    },

    abrir<T>(token: string | undefined, agora = Date.now()): T | null {
      if (!token) return null;
      const [corpo, assinatura] = token.split(".");
      if (!corpo || !assinatura) return null;
      const esperada = Buffer.from(assinar(`selo:${corpo}`));
      const recebida = Buffer.from(assinatura);
      if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
      try {
        const { d, e } = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
        return Number(e) > agora ? (d as T) : null;
      } catch {
        return null;
      }
    },
  };
}

export type Sessoes = ReturnType<typeof criarSessoes>;

/** Lê um cookie do cabeçalho, sem dependência extra. */
export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  for (const parte of (cabecalho ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) {
      try {
        return decodeURIComponent(parte.slice(i + 1).trim());
      } catch {
        return undefined; // Cookie malformado: como se não houvesse.
      }
    }
  }
  return undefined;
}

/**
 * Cookie da sessão. Em HTTPS usa o prefixo `__Host-`: o navegador só aceita esse cookie com
 * `Secure`, `Path=/` e sem `Domain`, então um subdomínio não consegue plantar nem sobrescrever a
 * sessão.
 */
export function cookieSessao(token: string, maxAge: number, seguro: boolean) {
  return [
    `${seguro ? COOKIE_SESSAO_HTTPS : COOKIE_SESSAO}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    ...(seguro ? ["Secure"] : []),
  ].join("; ");
}

/** Apaga o cookie da sessão. Em HTTPS, apaga também o de nome antigo, sem o prefixo. */
export function cookieSaida(seguro: boolean): string[] {
  return seguro ? [cookieSessao("", 0, true), `${COOKIE_SESSAO}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`] : [cookieSessao("", 0, false)];
}

/** Token da sessão no pedido. Em HTTPS, só o cookie com prefixo vale. */
export function tokenDaSessao(cabecalho: string | undefined, seguro: boolean) {
  return lerCookie(cabecalho, seguro ? COOKIE_SESSAO_HTTPS : COOKIE_SESSAO);
}
