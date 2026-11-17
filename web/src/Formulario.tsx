import { useCallback, useId, useState } from "react";
import { IconeAlerta } from "./Interface";

/** Mesma regra do servidor (server/src/banco/usuarios.ts). */
export const PADRAO_NOME = "[a-z0-9][a-z0-9._\\-]{1,39}";
export const ERRO_NOME = "Use de 2 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.";

type Erros = Record<string, string>;
type Campo = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Mensagem do próprio sistema para um campo inválido, ou null se está ok. */
function mensagem(el: Campo): string | null {
  const valor = el.value;
  if (el.required && !valor.trim()) return "Preencha este campo.";
  if (!valor || el instanceof HTMLSelectElement) return null;
  if (el.minLength > 0 && valor.length < el.minLength) return `Use pelo menos ${el.minLength} caracteres.`;
  if (el instanceof HTMLInputElement) {
    if (el.type === "email" && el.validity.typeMismatch) return "Digite um e-mail válido, como nome@empresa.com.";
    if (el.validity.patternMismatch) return el.dataset.erro || "Formato inválido.";
    if (el.type === "number") {
      const n = Number(valor);
      if (el.validity.badInput || !Number.isInteger(n)) return "Digite um número inteiro.";
      if ((el.min && n < Number(el.min)) || (el.max && n > Number(el.max))) return `Use um valor entre ${el.min} e ${el.max}.`;
    }
  }
  return null;
}

/**
 * Validação com mensagens do sistema, no lugar dos balões do navegador. O formulário usa
 * `noValidate`; os limites continuam nos atributos (required, minLength, pattern, min, max).
 */
export function useValidacao() {
  const prefixo = useId();
  const [erros, setErros] = useState<Erros>({});

  const validar = useCallback((form: HTMLFormElement) => {
    const novos: Erros = {};
    let primeiro: Campo | null = null;
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
      if (!el.name || el.disabled) continue;
      const m = mensagem(el);
      if (m) {
        novos[el.name] = m;
        primeiro ??= el;
      }
    }
    setErros(novos);
    (primeiro as Campo | null)?.focus();
    return !primeiro;
  }, []);

  const definir = useCallback((nome: string, texto: string) => {
    setErros((e) => ({ ...e, [nome]: texto }));
    document.getElementById(`${prefixo}-${nome}`)?.focus();
  }, [prefixo]);

  const limpar = useCallback((nome: string) => {
    setErros((e) => {
      if (!(nome in e)) return e;
      const { [nome]: _, ...resto } = e;
      return resto;
    });
  }, []);

  /** Atributos do campo: nome, id e ligação com a mensagem de erro. */
  const campo = (nome: string) => ({
    name: nome,
    id: `${prefixo}-${nome}`,
    "aria-invalid": erros[nome] ? true : undefined,
    "aria-describedby": erros[nome] ? `${prefixo}-${nome}-erro` : undefined,
    onInput: () => limpar(nome),
  });

  /** Mensagem embaixo do campo; some assim que a pessoa volta a digitar. */
  const erro = (nome: string) =>
    erros[nome] ? (
      // aria-hidden: fica fora do nome do campo; o leitor de tela lê pelo aria-describedby.
      <span className="erro-campo" id={`${prefixo}-${nome}-erro`} aria-hidden="true">
        <IconeAlerta />
        {erros[nome]}
      </span>
    ) : null;

  return { validar, definir, limpar, campo, erro };
}
