import type { Banco } from "./banco.js";

export type ContextoUsuario = { original: string; compacto: string; atualizadoEm: number | null; avisoDispensado: boolean };

type Linha = { original: string; compacto: string; atualizado_em: number | null; aviso_dispensado: number };

const VAZIO: ContextoUsuario = { original: "", compacto: "", atualizadoEm: null, avisoDispensado: false };

/** "Meu contexto" de cada pessoa: o texto dela e a versão compacta que vai nas gerações. */
export class RepositorioContextoUsuario {
  constructor(private readonly db: Banco) {}

  ler(usuario: string): ContextoUsuario {
    const l = this.db.prepare("SELECT original, compacto, atualizado_em, aviso_dispensado FROM contexto_usuario WHERE usuario = ?").get(usuario) as Linha | undefined;
    return l ? { original: l.original, compacto: l.compacto, atualizadoEm: l.atualizado_em, avisoDispensado: l.aviso_dispensado === 1 } : { ...VAZIO };
  }

  /** Só a versão compacta, para montar o pedido à IA ("" sem contexto). */
  compacto(usuario: string): string {
    return this.ler(usuario).compacto;
  }

  salvar(usuario: string, original: string, compacto: string, agora = Date.now()) {
    this.db
      .prepare(
        `INSERT INTO contexto_usuario (usuario, original, compacto, atualizado_em, aviso_dispensado) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (usuario) DO UPDATE SET original = excluded.original, compacto = excluded.compacto, atualizado_em = excluded.atualizado_em, aviso_dispensado = 1`,
      )
      .run(usuario, original, compacto, agora);
  }

  /** Apaga o texto; o aviso do primeiro acesso não volta. */
  apagar(usuario: string, agora = Date.now()) {
    this.salvar(usuario, "", "", agora);
  }

  dispensarAviso(usuario: string) {
    this.db.prepare("INSERT INTO contexto_usuario (usuario, aviso_dispensado) VALUES (?, 1) ON CONFLICT (usuario) DO UPDATE SET aviso_dispensado = 1").run(usuario);
  }
}
