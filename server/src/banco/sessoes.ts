import { createHash, randomBytes } from "node:crypto";
import type { Banco } from "./banco.js";

/** Sessão aberta, como a pessoa vê na lista (sem o token nem o hash). */
export type SessaoAberta = {
  id: number;
  criadaEm: number;
  ultimoUso: number;
  ip: string | null;
  navegador: string | null;
};

export type SessaoValida = SessaoAberta & {
  usuario: string;
  /** Passou pelo segundo fator (TOTP, chave de acesso ou SSO) nesta sessão. */
  mfa: boolean;
  /** Última vez que a senha (ou o código) foi confirmada de novo, para ações sensíveis. */
  reautenticadaEm: number;
};

type Linha = {
  id: number;
  usuario: string;
  criada_em: number;
  ultimo_uso: number;
  expira_em: number;
  ip: string | null;
  navegador: string | null;
  mfa: number;
  reautenticada_em: number;
};

/** O "último uso" é gravado no máximo uma vez por minuto, para não escrever no banco a cada pedido. */
const TOCAR_A_CADA_MS = 60_000;

const hashDe = (token: string) => createHash("sha256").update(token).digest("hex");
const paraSessao = (l: Linha): SessaoValida => ({
  id: l.id,
  usuario: l.usuario,
  criadaEm: l.criada_em,
  ultimoUso: l.ultimo_uso,
  ip: l.ip,
  navegador: l.navegador,
  mfa: l.mfa === 1,
  reautenticadaEm: l.reautenticada_em,
});

/**
 * Sessões no servidor. O cookie leva um id aleatório de 256 bits; o banco guarda só o SHA-256 dele,
 * então quem lê o banco (ou um backup) não consegue usar as sessões. Encerrar uma sessão é apagar a
 * linha: vale na hora, em todos os pedidos seguintes.
 */
export class RepositorioSessoes {
  constructor(
    private readonly db: Banco,
    private readonly validadeMs: number,
  ) {}

  /** Abre uma sessão e devolve o token que vai no cookie (só aparece aqui). */
  criar(usuario: string, origem: { ip?: string | null; navegador?: string | null; mfa?: boolean }, agora = Date.now()): string {
    const token = randomBytes(32).toString("base64url");
    this.db
      .prepare("INSERT INTO sessoes (hash, usuario, criada_em, ultimo_uso, expira_em, ip, navegador, mfa, reautenticada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        hashDe(token),
        usuario,
        agora,
        agora,
        agora + this.validadeMs,
        origem.ip?.slice(0, 64) ?? null,
        origem.navegador?.slice(0, 200) ?? null,
        origem.mfa ? 1 : 0,
        // Quem acabou de digitar a senha conta como confirmado agora.
        agora,
      );
    return token;
  }

  /** A sessão passou pelo segundo fator (ex.: ligou o MFA nela). */
  marcarMfa(id: number) {
    this.db.prepare("UPDATE sessoes SET mfa = 1 WHERE id = ?").run(id);
  }

  /** A pessoa confirmou a senha (ou o código) de novo nesta sessão. */
  reautenticar(id: number, agora = Date.now()) {
    this.db.prepare("UPDATE sessoes SET reautenticada_em = ? WHERE id = ?").run(agora, id);
  }

  /** Sessão do token, se existir e não tiver vencido. Atualiza o último uso. */
  buscar(token: string | undefined, agora = Date.now()): SessaoValida | null {
    if (!token || token.length > 200) return null;
    const l = this.db.prepare("SELECT * FROM sessoes WHERE hash = ?").get(hashDe(token)) as Linha | undefined;
    if (!l || l.expira_em <= agora) return null;
    if (agora - l.ultimo_uso >= TOCAR_A_CADA_MS) {
      this.db.prepare("UPDATE sessoes SET ultimo_uso = ? WHERE id = ?").run(agora, l.id);
      l.ultimo_uso = agora;
    }
    return paraSessao(l);
  }

  /**
   * Sessões abertas de alguém, mais recente primeiro. `desde`: as criadas antes disso já não valem
   * (senha trocada ou conta desativada) e ficam fora da lista.
   */
  listar(usuario: string, desde: number, agora = Date.now()): SessaoAberta[] {
    return (
      this.db
        .prepare("SELECT * FROM sessoes WHERE usuario = ? AND expira_em > ? AND criada_em >= ? ORDER BY ultimo_uso DESC, id DESC")
        .all(usuario, agora, desde) as Linha[]
    ).map((l) => {
      const { usuario: _u, mfa: _m, reautenticadaEm: _r, ...s } = paraSessao(l);
      return s;
    });
  }

  /** Encerra uma sessão de alguém. Falso se não existe ou é de outra pessoa. */
  encerrar(id: number, usuario: string): boolean {
    return Number(this.db.prepare("DELETE FROM sessoes WHERE id = ? AND usuario = ?").run(id, usuario).changes) > 0;
  }

  encerrarPorToken(token: string | undefined): boolean {
    if (!token || token.length > 200) return false;
    return Number(this.db.prepare("DELETE FROM sessoes WHERE hash = ?").run(hashDe(token)).changes) > 0;
  }

  /** Encerra todas as sessões de alguém. Devolve quantas eram. */
  encerrarTodas(usuario: string): number {
    return Number(this.db.prepare("DELETE FROM sessoes WHERE usuario = ?").run(usuario).changes);
  }

  /** Apaga as vencidas e as que já não valem (senha trocada, conta desativada ou apagada). */
  expurgar(agora = Date.now()): number {
    return Number(
      this.db
        .prepare(
          `DELETE FROM sessoes WHERE expira_em <= ?
             OR NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.email = sessoes.usuario AND u.ativo = 1 AND sessoes.criada_em >= u.sessoes_desde)`,
        )
        .run(agora).changes,
    );
  }
}
