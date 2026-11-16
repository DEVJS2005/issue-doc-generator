import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** O token leva só o e-mail; o perfil (admin, ativo) é relido do banco a cada pedido. */
type Usuario = { email: string };

export const COOKIE_SESSAO = "idg_sessao";

/**
 * Sessão sem estado: o cookie leva "email|expiraEm" assinado com HMAC-SHA256. Sem banco de
 * sessões; para invalidar todas as sessões, troque SEGREDO_SESSAO.
 */
export function criarSessoes(segredo: string, horas: number) {
  const chave = segredo || randomBytes(32).toString("hex");
  const assinar = (dados: string) => createHmac("sha256", chave).update(dados).digest("base64url");

  return {
    segredoTemporario: !segredo,
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

    criar(usuario: Usuario, agora = Date.now()): string {
      const dados = Buffer.from(`${usuario.email}|${agora + horas * 3_600_000}`).toString("base64url");
      return `${dados}.${assinar(dados)}`;
    },

    ler(token: string | undefined, agora = Date.now()): Usuario | null {
      if (!token) return null;
      const [dados, assinatura] = token.split(".");
      if (!dados || !assinatura) return null;
      const esperada = Buffer.from(assinar(dados));
      const recebida = Buffer.from(assinatura);
      if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
      const [email, expira] = Buffer.from(dados, "base64url").toString("utf8").split("|");
      if (!email || !(Number(expira) > agora)) return null;
      return { email };
    },
  };
}

export type Sessoes = ReturnType<typeof criarSessoes>;

/** Lê um cookie do cabeçalho, sem dependência extra. */
export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  for (const parte of (cabecalho ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return undefined;
}

export function cookieSessao(token: string, maxAge: number, seguro: boolean) {
  return [
    `${COOKIE_SESSAO}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    ...(seguro ? ["Secure"] : []),
  ].join("; ");
}

export function cookieSaida(seguro: boolean) {
  return cookieSessao("", 0, seguro);
}
