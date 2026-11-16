import { conferirSenha, gerarHash, HASH_INEXISTENTE, SENHA_MINIMA } from "../auth/senha.js";
import { ErroValidacao, type Banco } from "./banco.js";

export type UsuarioBanco = {
  id: number;
  email: string;
  admin: boolean;
  ativo: boolean;
  criadoEm: number;
  atualizadoEm: number;
};

type Linha = {
  id: number;
  email: string;
  senha_hash: string;
  admin: number;
  ativo: number;
  criado_em: number;
  atualizado_em: number;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function paraUsuario(l: Linha): UsuarioBanco {
  return { id: l.id, email: l.email, admin: l.admin === 1, ativo: l.ativo === 1, criadoEm: l.criado_em, atualizadoEm: l.atualizado_em };
}

function validarSenha(senha: string) {
  if (senha.length < SENHA_MINIMA) throw new ErroValidacao(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  if (senha.length > 200) throw new ErroValidacao("A senha pode ter até 200 caracteres.");
}

export class RepositorioUsuarios {
  constructor(private readonly db: Banco) {}

  contar(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n;
  }

  private contarAdminsAtivos(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE admin = 1 AND ativo = 1").get() as { n: number }).n;
  }

  buscar(email: string): UsuarioBanco | null {
    const l = this.db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email.trim()) as Linha | undefined;
    return l ? paraUsuario(l) : null;
  }

  private buscarPorId(id: number): Linha | undefined {
    return this.db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id) as Linha | undefined;
  }

  /** E-mail e senha certos e usuário ativo. Compara a senha mesmo quando o e-mail não existe. */
  autenticar(email: string, senha: string): UsuarioBanco | null {
    const l = this.db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email.trim()) as Linha | undefined;
    const ok = conferirSenha(senha, l?.senha_hash ?? HASH_INEXISTENTE);
    return ok && l && l.ativo === 1 ? paraUsuario(l) : null;
  }

  listar(): UsuarioBanco[] {
    return (this.db.prepare("SELECT * FROM usuarios ORDER BY email").all() as Linha[]).map(paraUsuario);
  }

  /** `validar: false` só na importação do .env antigo, para não recusar senhas curtas já em uso. */
  criar(email: string, senha: string, admin: boolean, opcoes: { validar?: boolean; agora?: number } = {}): UsuarioBanco {
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) throw new ErroValidacao("Informe um e-mail válido.");
    if (opcoes.validar !== false) validarSenha(senha);
    if (this.buscar(e)) throw new ErroValidacao("Já existe um usuário com esse e-mail.", "email_em_uso");
    const agora = opcoes.agora ?? Date.now();
    const r = this.db
      .prepare("INSERT INTO usuarios (email, senha_hash, admin, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, 1, ?, ?)")
      .run(e, gerarHash(senha), admin ? 1 : 0, agora, agora);
    return paraUsuario(this.buscarPorId(Number(r.lastInsertRowid))!);
  }

  /** Muda admin, ativo ou senha. Nunca deixa o sistema sem nenhum admin ativo. */
  atualizar(id: number, mudancas: { admin?: boolean; ativo?: boolean; senha?: string }): UsuarioBanco {
    const atual = this.buscarPorId(id);
    if (!atual) throw new ErroValidacao("Usuário não encontrado.", "nao_encontrado");
    const eraAdminAtivo = atual.admin === 1 && atual.ativo === 1;
    const admin = mudancas.admin ?? atual.admin === 1;
    const ativo = mudancas.ativo ?? atual.ativo === 1;
    if (eraAdminAtivo && !(admin && ativo) && this.contarAdminsAtivos() <= 1) {
      throw new ErroValidacao("É preciso manter pelo menos um administrador ativo.", "ultimo_admin");
    }
    if (mudancas.senha !== undefined) validarSenha(mudancas.senha);
    this.db
      .prepare("UPDATE usuarios SET admin = ?, ativo = ?, senha_hash = ?, atualizado_em = ? WHERE id = ?")
      .run(admin ? 1 : 0, ativo ? 1 : 0, mudancas.senha !== undefined ? gerarHash(mudancas.senha) : atual.senha_hash, Date.now(), id);
    return paraUsuario(this.buscarPorId(id)!);
  }
}
