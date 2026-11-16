import { createHash, timingSafeEqual } from "node:crypto";

export type Usuario = { email: string };

/**
 * Adaptador de login. Hoje: e-mail e senha do .env (USUARIOS_PERMITIDOS). Para trocar por
 * SSO/OAuth, implemente esta interface (ou troque a rota de login por um callback OAuth que
 * chame `criarSessao`) sem mexer no resto do servidor.
 */
export interface Autenticador {
  readonly nome: string;
  autenticar(email: string, senha: string): Promise<Usuario | null>;
}

function resumo(texto: string) {
  return createHash("sha256").update(texto, "utf8").digest();
}

/** Compara em tempo constante, para o tempo de resposta não revelar parte da senha. */
function iguais(a: string, b: string) {
  return timingSafeEqual(resumo(a), resumo(b));
}

/**
 * Lê "email:senha,email2:senha2". A senha é tudo depois do primeiro ":" (pode conter ":", mas
 * não vírgula). E-mails são comparados sem diferenciar maiúsculas.
 */
export function criarAutenticadorEnv(entradas: string[]): Autenticador {
  const usuarios = new Map<string, string>();
  for (const item of entradas) {
    const i = item.indexOf(":");
    if (i <= 0 || i === item.length - 1) continue;
    usuarios.set(item.slice(0, i).trim().toLowerCase(), item.slice(i + 1));
  }

  return {
    nome: "env",
    async autenticar(email, senha) {
      const chave = email.trim().toLowerCase();
      const esperada = usuarios.get(chave);
      // Compara mesmo quando o e-mail não existe, para não revelar quais e-mails são válidos.
      const ok = iguais(senha, esperada ?? "\u0000senha-inexistente");
      return ok && esperada !== undefined ? { email: chave } : null;
    },
  };
}

export function contarUsuarios(entradas: string[]) {
  return entradas.filter((e) => e.indexOf(":") > 0).length;
}
