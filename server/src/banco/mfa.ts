import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { conferirSenha, gerarHash } from "../auth/senha.js";
import { conferirCodigo, gerarSegredo } from "../auth/totp.js";
import type { Banco } from "./banco.js";

/** Quantos códigos de recuperação cada pessoa recebe. */
export const CODIGOS_RECUPERACAO = 10;

type LinhaTotp = { usuario: string; segredo: string; ativo: number; ultimo_passo: number };

/** "xxxxx-xxxxx": 10 caracteres de um alfabeto sem letras parecidas (0/O, 1/l). ~50 bits. */
function codigoRecuperacao(): string {
  const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  const c = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join("");
  return `${c.slice(0, 5)}-${c.slice(5)}`;
}

const normalizarRecuperacao = (codigo: string) => codigo.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * MFA por TOTP. O segredo fica cifrado (AES-256-GCM com a subchave "mfa", derivada do
 * SEGREDO_SESSAO): quem lê o banco ou um backup não consegue gerar códigos. Os códigos de
 * recuperação ficam só como hash scrypt e valem uma vez cada.
 */
export class RepositorioMfa {
  constructor(
    private readonly db: Banco,
    private readonly chave: Buffer,
  ) {}

  private cifrar(segredo: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.chave, iv);
    const corpo = Buffer.concat([c.update(segredo, "utf8"), c.final()]);
    return [iv, corpo, c.getAuthTag()].map((b) => b.toString("base64url")).join(".");
  }

  private decifrar(guardado: string): string | null {
    try {
      const [iv, corpo, tag] = guardado.split(".").map((p) => Buffer.from(p, "base64url"));
      const d = createDecipheriv("aes-256-gcm", this.chave, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(corpo), d.final()]).toString("utf8");
    } catch {
      return null; // SEGREDO_SESSAO trocado: o segredo antigo não abre mais.
    }
  }

  private linha(usuario: string): LinhaTotp | null {
    return (this.db.prepare("SELECT * FROM mfa_totp WHERE usuario = ?").get(usuario) as LinhaTotp | undefined) ?? null;
  }

  ativo(usuario: string): boolean {
    return this.linha(usuario)?.ativo === 1;
  }

  codigosRestantes(usuario: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM mfa_recuperacao WHERE usuario = ? AND usado_em IS NULL").get(usuario) as { n: number }).n;
  }

  /** Começa (ou recomeça) a configuração: segredo novo, ainda inativo. Recusa se já estiver ativo. */
  iniciar(usuario: string, agora = Date.now()): string | null {
    if (this.ativo(usuario)) return null;
    const segredo = gerarSegredo();
    this.db
      .prepare(
        `INSERT INTO mfa_totp (usuario, segredo, ativo, criado_em, ultimo_passo) VALUES (?, ?, 0, ?, 0)
         ON CONFLICT (usuario) DO UPDATE SET segredo = excluded.segredo, ativo = 0, criado_em = excluded.criado_em, ativado_em = NULL, ultimo_passo = 0`,
      )
      .run(usuario, this.cifrar(segredo), agora);
    return segredo;
  }

  /** Confere um código TOTP (o pendente, se `pendente`) e grava o passo para ele não valer de novo. */
  private conferirTotp(usuario: string, codigo: string, pendente: boolean, agora: number): boolean {
    const l = this.linha(usuario);
    if (!l || (l.ativo === 1) === pendente) return false;
    const segredo = this.decifrar(l.segredo);
    if (!segredo) return false;
    const passo = conferirCodigo(segredo, codigo, agora, l.ultimo_passo);
    if (passo === null) return false;
    this.db.prepare("UPDATE mfa_totp SET ultimo_passo = ? WHERE usuario = ?").run(passo, usuario);
    return true;
  }

  /** Ativa com o primeiro código certo e devolve os códigos de recuperação (só aparecem aqui). */
  ativar(usuario: string, codigo: string, agora = Date.now()): string[] | null {
    if (!this.conferirTotp(usuario, codigo, true, agora)) return null;
    this.db.prepare("UPDATE mfa_totp SET ativo = 1, ativado_em = ? WHERE usuario = ?").run(agora, usuario);
    return this.novosCodigos(usuario);
  }

  /** Troca todos os códigos de recuperação por novos. */
  novosCodigos(usuario: string): string[] {
    const codigos = Array.from({ length: CODIGOS_RECUPERACAO }, codigoRecuperacao);
    this.db.prepare("DELETE FROM mfa_recuperacao WHERE usuario = ?").run(usuario);
    const inserir = this.db.prepare("INSERT INTO mfa_recuperacao (usuario, hash) VALUES (?, ?)");
    for (const c of codigos) inserir.run(usuario, gerarHash(normalizarRecuperacao(c)));
    return codigos;
  }

  /**
   * Segundo fator na entrada ou na confirmação: código do aplicativo (6 dígitos) ou de
   * recuperação (que é gasto). Diz qual foi usado.
   */
  conferir(usuario: string, codigo: string, agora = Date.now()): "totp" | "recuperacao" | null {
    if (/^\s*\d{6}\s*$/.test(codigo)) return this.conferirTotp(usuario, codigo, false, agora) ? "totp" : null;
    if (!this.ativo(usuario)) return null;
    const limpo = normalizarRecuperacao(codigo);
    if (limpo.length !== 10) return null;
    const linhas = this.db.prepare("SELECT id, hash FROM mfa_recuperacao WHERE usuario = ? AND usado_em IS NULL").all(usuario) as { id: number; hash: string }[];
    const achado = linhas.find((l) => conferirSenha(limpo, l.hash));
    if (!achado) return null;
    this.db.prepare("UPDATE mfa_recuperacao SET usado_em = ? WHERE id = ?").run(agora, achado.id);
    return "recuperacao";
  }

  desativar(usuario: string) {
    this.db.prepare("DELETE FROM mfa_totp WHERE usuario = ?").run(usuario);
    this.db.prepare("DELETE FROM mfa_recuperacao WHERE usuario = ?").run(usuario);
  }
}
