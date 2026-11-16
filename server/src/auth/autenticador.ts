import type { RepositorioUsuarios } from "../banco/usuarios.js";

export type Usuario = { email: string; admin: boolean };

/**
 * Adaptador de login. Hoje: e-mail e senha guardados no banco (hash scrypt), geridos na tela de
 * administração. Para SSO/OAuth, implemente esta interface (ou troque a rota de login por um
 * callback OAuth que crie a mesma sessão); o perfil de admin continua vindo do banco.
 */
export interface Autenticador {
  readonly nome: string;
  autenticar(email: string, senha: string): Promise<Usuario | null>;
}

export function criarAutenticadorBanco(usuarios: RepositorioUsuarios): Autenticador {
  return {
    nome: "banco",
    async autenticar(email, senha) {
      const u = usuarios.autenticar(email, senha);
      return u ? { email: u.email, admin: u.admin } : null;
    },
  };
}

/** Lê "email:senha,email2:senha2" (formato antigo do .env). A senha é tudo depois do 1º ":". */
export function lerUsuariosDoEnv(entradas: string[]): { email: string; senha: string }[] {
  return entradas.flatMap((item) => {
    const i = item.indexOf(":");
    if (i <= 0 || i === item.length - 1) return [];
    return [{ email: item.slice(0, i).trim().toLowerCase(), senha: item.slice(i + 1) }];
  });
}
