import { api, ErroApi } from "./api";
import type { useDialogo } from "./Dialogo";

/**
 * Ações sensíveis (baixar backup, criar ou promover admin, mexer no MFA) pedem a senha confirmada
 * nos últimos 5 minutos. Roda a ação; se o servidor pedir, pergunta a senha, confirma e tenta de
 * novo. Devolve null se a pessoa cancelar.
 */
export async function comConfirmacaoDeSenha<T>(dialogo: ReturnType<typeof useDialogo>, acao: () => Promise<T>): Promise<T | null> {
  try {
    return await acao();
  } catch (e) {
    if (!(e instanceof ErroApi) || e.erro.codigo !== "reautenticar") throw e;
  }
  const senha = await dialogo.pedirTexto({
    titulo: "Confirme sua senha",
    mensagem: "Esta ação pede a sua senha de novo.",
    rotulo: "Senha",
    acao: "Confirmar",
    senha: true,
  });
  if (senha === null) return null;
  await api.reautenticar(senha);
  return acao();
}
