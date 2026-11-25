import type { Banco } from "./banco.js";

export type ChaveAcesso = {
  id: string;
  usuario: string;
  chavePublica: Uint8Array;
  contador: number;
  transportes: string[];
  nome: string;
  criadaEm: number;
  ultimoUso: number | null;
};

type Linha = {
  id: string;
  usuario: string;
  chave_publica: Uint8Array;
  contador: number;
  transportes: string | null;
  nome: string;
  criada_em: number;
  ultimo_uso: number | null;
};

const paraChave = (l: Linha): ChaveAcesso => ({
  id: l.id,
  usuario: l.usuario,
  chavePublica: new Uint8Array(l.chave_publica),
  contador: l.contador,
  transportes: l.transportes ? (JSON.parse(l.transportes) as string[]) : [],
  nome: l.nome,
  criadaEm: l.criada_em,
  ultimoUso: l.ultimo_uso,
});

/** Chaves de acesso (passkeys): só a chave pública fica aqui; a privada nunca sai do aparelho. */
export class RepositorioChavesAcesso {
  constructor(private readonly db: Banco) {}

  buscar(id: string): ChaveAcesso | null {
    const l = this.db.prepare("SELECT * FROM chaves_acesso WHERE id = ?").get(id) as Linha | undefined;
    return l ? paraChave(l) : null;
  }

  listar(usuario: string): ChaveAcesso[] {
    return (this.db.prepare("SELECT * FROM chaves_acesso WHERE usuario = ? ORDER BY criada_em").all(usuario) as Linha[]).map(paraChave);
  }

  contar(usuario: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM chaves_acesso WHERE usuario = ?").get(usuario) as { n: number }).n;
  }

  criar(c: Omit<ChaveAcesso, "criadaEm" | "ultimoUso">, agora = Date.now()) {
    this.db
      .prepare("INSERT INTO chaves_acesso (id, usuario, chave_publica, contador, transportes, nome, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(c.id, c.usuario, c.chavePublica, c.contador, JSON.stringify(c.transportes), c.nome.slice(0, 60), agora);
  }

  /** Depois de um login: o contador novo (contra clones) e o último uso. */
  usar(id: string, contador: number, agora = Date.now()) {
    this.db.prepare("UPDATE chaves_acesso SET contador = ?, ultimo_uso = ? WHERE id = ?").run(contador, agora, id);
  }

  remover(id: string, usuario: string): boolean {
    return Number(this.db.prepare("DELETE FROM chaves_acesso WHERE id = ? AND usuario = ?").run(id, usuario).changes) > 0;
  }
}
