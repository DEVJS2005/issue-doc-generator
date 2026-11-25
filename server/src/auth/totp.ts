import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// TOTP (RFC 6238) com HMAC-SHA1, passos de 30 s e 6 dígitos: o que os aplicativos autenticadores
// (Google Authenticator, Microsoft Authenticator, 1Password, Aegis...) usam por padrão.

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const PASSO_SEGUNDOS = 30;
export const DIGITOS = 6;
/** Aceita o passo anterior e o seguinte também (relógio do celular um pouco adiantado ou atrasado). */
const TOLERANCIA = 1;

export function base32(dados: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of dados) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpo) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error("base32 inválido");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segredo novo de 160 bits (o tamanho recomendado para HMAC-SHA1), em base32. */
export function gerarSegredo(): string {
  return base32(randomBytes(20));
}

/** Código de um passo (HOTP, RFC 4226). */
export function codigoDoPasso(segredo: Buffer, passo: number, digitos = DIGITOS): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac("sha1", segredo).update(contador).digest();
  const deslocamento = hmac[hmac.length - 1] & 15;
  const numero = hmac.readUInt32BE(deslocamento) & 0x7fffffff;
  return String(numero % 10 ** digitos).padStart(digitos, "0");
}

export const passoEm = (agoraMs: number) => Math.floor(agoraMs / 1000 / PASSO_SEGUNDOS);

/**
 * Confere um código de 6 dígitos. Devolve o passo usado, ou null. Um passo igual ou anterior ao
 * `ultimoPasso` (o último código aceito) é recusado: o mesmo código não entra duas vezes.
 */
export function conferirCodigo(segredoBase32: string, codigo: string, agoraMs: number, ultimoPasso = 0): number | null {
  const limpo = codigo.replace(/\s/g, "");
  if (!/^\d{6}$/.test(limpo)) return null;
  const segredo = deBase32(segredoBase32);
  const atual = passoEm(agoraMs);
  for (let d = -TOLERANCIA; d <= TOLERANCIA; d++) {
    const passo = atual + d;
    if (passo <= ultimoPasso) continue;
    const esperado = Buffer.from(codigoDoPasso(segredo, passo));
    if (timingSafeEqual(esperado, Buffer.from(limpo))) return passo;
  }
  return null;
}

/** Endereço otpauth:// que o aplicativo autenticador lê pelo QR code. */
export function uriOtpauth(segredoBase32: string, conta: string, emissor = "Issue Doc Generator"): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  const p = new URLSearchParams({ secret: segredoBase32, issuer: emissor, algorithm: "SHA1", digits: String(DIGITOS), period: String(PASSO_SEGUNDOS) });
  return `otpauth://totp/${rotulo}?${p.toString()}`;
}
