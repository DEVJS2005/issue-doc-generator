import { conferirSenha, gerarHash, HASH_INEXISTENTE, SENHA_MINIMA } from "../auth/senha.js";
import { ErroValidacao, type Banco } from "./banco.js";

export type UsuarioBanco = {
  id: number;
  /** Nome de usuário: entra no login e aparece na tela. */
  nome: string;
  /** Identidade interna (histórico, sessões, SSO). Também aceito no login. */
  email: string;
  admin: boolean;
  ativo: boolean;
  criadoEm: number;
  atualizadoEm: number;
};

type Linha = {
  id: number;
  nome: string | null;
  email: string;
  senha_hash: string;
  admin: number;
  ativo: number;
  criado_em: number;
  atualizado_em: number;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Letras minúsculas, números, ponto, hífen e sublinhado; começa com letra ou número. */
const NOME = /^[a-z0-9][a-z0-9._-]{1,39}$/;

function paraUsuario(l: Linha): UsuarioBanco {
  return {
    id: l.id,
    nome: l.nome ?? l.email,
    email: l.email,
    admin: l.admin === 1,
    ativo: l.ativo === 1,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

function validarSenha(senha: string) {
  if (senha.length < SENHA_MINIMA) throw new ErroValidacao(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  if (senha.length > 200) throw new ErroValidacao("A senha pode ter até 200 caracteres.");
}

function normalizarNome(nome: string) {
  const n = nome.trim().toLowerCase();
  if (!NOME.test(n)) {
    throw new ErroValidacao("O nome de usuário deve ter de 2 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.");
  }
  return n;
}

/** Nome sugerido a partir do e-mail (parte antes do @), só com os caracteres aceitos. */
export function nomeDoEmail(email: string) {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+/, "");
  return (base.length >= 2 ? base : `usuario${base}`).slice(0, 40);
}

export class RepositorioUsuarios {
  constructor(private readonly db: Banco) {}

  contar(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n;
  }

  private contarAdminsAtivos(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE admin = 1 AND ativo = 1").get() as { n: number }).n;
  }

  /** Por e-mail (identidade interna). */
  buscar(email: string): UsuarioBanco | null {
    const l = this.db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email.trim()) as Linha | undefined;
    return l ? paraUsuario(l) : null;
  }

  /** Sessões emitidas antes deste instante (ms) não valem mais. */
  sessoesValidasDesde(email: string): number {
    const l = this.db.prepare("SELECT sessoes_desde FROM usuarios WHERE email = ?").get(email.trim()) as { sessoes_desde: number } | undefined;
    return l?.sessoes_desde ?? 0;
  }

  private buscarPorId(id: number): Linha | undefined {
    return this.db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id) as Linha | undefined;
  }

  private nomeEmUso(nome: string, excetoId?: number) {
    const l = this.db.prepare("SELECT id FROM usuarios WHERE nome = ? COLLATE NOCASE").get(nome) as { id: number } | undefined;
    return l !== undefined && l.id !== excetoId;
  }

  /** Primeiro nome livre a partir de `base` (base, base-2, base-3…). */
  private nomeLivre(base: string) {
    if (!this.nomeEmUso(base)) return base;
    for (let i = 2; ; i++) {
      const candidato = `${base.slice(0, 36)}-${i}`;
      if (!this.nomeEmUso(candidato)) return candidato;
    }
  }

  /**
   * Nome de usuário ou e-mail (o nome nunca tem "@", então não há ambiguidade) e senha certos, e
   * usuário ativo. Compara a senha mesmo quando o usuário não existe, para não revelar quem existe.
   */
  autenticar(login: string, senha: string): UsuarioBanco | null {
    const valor = login.trim();
    const l = (
      valor.includes("@")
        ? this.db.prepare("SELECT * FROM usuarios WHERE email = ?").get(valor)
        : this.db.prepare("SELECT * FROM usuarios WHERE nome = ? COLLATE NOCASE").get(valor)
    ) as Linha | undefined;
    const ok = conferirSenha(senha, l?.senha_hash ?? HASH_INEXISTENTE);
    return ok && l && l.ativo === 1 ? paraUsuario(l) : null;
  }

  listar(): UsuarioBanco[] {
    return (this.db.prepare("SELECT * FROM usuarios ORDER BY nome").all() as Linha[]).map(paraUsuario);
  }

  /** Mapa e-mail → nome, para mostrar o nome no histórico. */
  nomesPorEmail(): Map<string, string> {
    const linhas = this.db.prepare("SELECT email, nome FROM usuarios").all() as { email: string; nome: string | null }[];
    return new Map(linhas.map((l) => [l.email, l.nome ?? l.email]));
  }

  /**
   * Sem `nome`, usa um livre a partir do e-mail. `validar: false` só na importação do .env antigo
   * e no cadastro pelo SSO, para não recusar senhas curtas ou geradas.
   */
  criar(email: string, senha: string, admin: boolean, opcoes: { nome?: string; validar?: boolean; agora?: number } = {}): UsuarioBanco {
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) throw new ErroValidacao("Informe um e-mail válido.");
    const nome = opcoes.nome?.trim() ? normalizarNome(opcoes.nome) : this.nomeLivre(nomeDoEmail(e));
    if (opcoes.validar !== false) validarSenha(senha);
    if (this.buscar(e)) throw new ErroValidacao("Já existe um usuário com esse e-mail.", "email_em_uso");
    if (this.nomeEmUso(nome)) throw new ErroValidacao("Já existe um usuário com esse nome.", "nome_em_uso");
    const agora = opcoes.agora ?? Date.now();
    const r = this.db
      .prepare("INSERT INTO usuarios (nome, email, senha_hash, admin, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, 1, ?, ?)")
      .run(nome, e, gerarHash(senha), admin ? 1 : 0, agora, agora);
    return paraUsuario(this.buscarPorId(Number(r.lastInsertRowid))!);
  }

  /** Muda nome, admin, ativo ou senha. Nunca deixa o sistema sem nenhum admin ativo. */
  atualizar(id: number, mudancas: { nome?: string; admin?: boolean; ativo?: boolean; senha?: string }): UsuarioBanco {
    const atual = this.buscarPorId(id);
    if (!atual) throw new ErroValidacao("Usuário não encontrado.", "nao_encontrado");
    const eraAdminAtivo = atual.admin === 1 && atual.ativo === 1;
    const admin = mudancas.admin ?? atual.admin === 1;
    const ativo = mudancas.ativo ?? atual.ativo === 1;
    if (eraAdminAtivo && !(admin && ativo) && this.contarAdminsAtivos() <= 1) {
      throw new ErroValidacao("É preciso manter pelo menos um administrador ativo.", "ultimo_admin");
    }
    if (mudancas.senha !== undefined) validarSenha(mudancas.senha);
    const nome = mudancas.nome !== undefined ? normalizarNome(mudancas.nome) : atual.nome;
    if (mudancas.nome !== undefined && this.nomeEmUso(nome!, id)) {
      throw new ErroValidacao("Já existe um usuário com esse nome.", "nome_em_uso");
    }
    const agora = Date.now();
    // Senha nova ou conta desativada: as sessões abertas dessa pessoa caem.
    const derrubarSessoes = mudancas.senha !== undefined || (mudancas.ativo === false && atual.ativo === 1);
    this.db
      .prepare("UPDATE usuarios SET nome = ?, admin = ?, ativo = ?, senha_hash = ?, atualizado_em = ?, sessoes_desde = CASE WHEN ? THEN ? ELSE sessoes_desde END WHERE id = ?")
      .run(
        nome,
        admin ? 1 : 0,
        ativo ? 1 : 0,
        mudancas.senha !== undefined ? gerarHash(mudancas.senha) : atual.senha_hash,
        agora,
        derrubarSessoes ? 1 : 0,
        agora,
        id,
      );
    return paraUsuario(this.buscarPorId(id)!);
  }
}
