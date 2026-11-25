// Autenticador de software, só para os testes: faz o papel do aparelho (celular, Windows Hello,
// chave de segurança) e gera respostas WebAuthn de verdade, que a biblioteca do servidor confere.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest();

/** CBOR mínimo (inteiros, bytes, texto e mapas), o que o WebAuthn usa. */
type Cbor = number | Uint8Array | string | Map<number | string, Cbor>;
function cabeca(tipo: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(tipo << 5) | n]);
  if (n < 256) return Buffer.from([(tipo << 5) | 24, n]);
  if (n < 65536) return Buffer.from([(tipo << 5) | 25, n >> 8, n & 255]);
  const b = Buffer.alloc(5);
  b[0] = (tipo << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}
function cbor(v: Cbor): Buffer {
  if (typeof v === "number") return v >= 0 ? cabeca(0, v) : cabeca(1, -1 - v);
  if (typeof v === "string") return Buffer.concat([cabeca(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (v instanceof Uint8Array) return Buffer.concat([cabeca(2, v.length), Buffer.from(v)]);
  return Buffer.concat([cabeca(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
}

export class AutenticadorFalso {
  readonly idCredencial = randomBytes(16);
  private readonly privada: KeyObject;
  private readonly publica: KeyObject;
  private contador = 0;

  constructor(
    private readonly origem: string,
    private readonly dominio: string,
  ) {
    const par = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privada = par.privateKey;
    this.publica = par.publicKey;
  }

  get id() {
    return b64u(this.idCredencial);
  }

  private dadosDoAutenticador(comCredencial: boolean) {
    // Flags: UP (presença) + UV (biometria/PIN) e, no cadastro, AT (com credencial).
    const flags = 0x01 | 0x04 | (comCredencial ? 0x40 : 0);
    const contador = Buffer.alloc(4);
    contador.writeUInt32BE(++this.contador);
    const partes = [sha256(this.dominio), Buffer.from([flags]), contador];
    if (comCredencial) {
      const jwk = this.publica.export({ format: "jwk" });
      const cose = new Map<number, Cbor>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(jwk.x!, "base64url")],
        [-3, Buffer.from(jwk.y!, "base64url")],
      ]);
      const tamanho = Buffer.alloc(2);
      tamanho.writeUInt16BE(this.idCredencial.length);
      partes.push(Buffer.alloc(16), tamanho, this.idCredencial, cbor(cose));
    }
    return Buffer.concat(partes);
  }

  private clientData(tipo: "webauthn.create" | "webauthn.get", desafio: string, origem = this.origem) {
    return Buffer.from(JSON.stringify({ type: tipo, challenge: desafio, origin: origem, crossOrigin: false }));
  }

  /** Resposta ao cadastro (navigator.credentials.create). */
  cadastrar(opcoes: { challenge: string }) {
    const atestado = cbor(new Map<string, Cbor>([["fmt", "none"], ["attStmt", new Map()], ["authData", this.dadosDoAutenticador(true)]]));
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: { clientDataJSON: b64u(this.clientData("webauthn.create", opcoes.challenge)), attestationObject: b64u(atestado), transports: ["internal"] },
      clientExtensionResults: {},
    };
  }

  /** Resposta ao login (navigator.credentials.get). `origem` diferente simula um site falso. */
  entrar(opcoes: { challenge: string }, origem = this.origem) {
    const dados = this.dadosDoAutenticador(false);
    const cliente = this.clientData("webauthn.get", opcoes.challenge, origem);
    const assinatura = sign("sha256", Buffer.concat([dados, sha256(cliente)]), this.privada);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: { clientDataJSON: b64u(cliente), authenticatorData: b64u(dados), signature: b64u(assinatura) },
      clientExtensionResults: {},
    };
  }
}
