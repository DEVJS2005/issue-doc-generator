import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ErroApi } from "../src/api";
import { comConfirmacaoDeSenha } from "../src/confirmarSenha";
import { textoDosCodigos } from "../src/Mfa";

const pedeSenha = new ErroApi({ codigo: "reautenticar", mensagem: "Confirme sua senha para continuar.", podeTentarDeNovo: false }, 403);

function dialogo(resposta: string | null) {
  return { confirmar: vi.fn(), pedirTexto: vi.fn().mockResolvedValue(resposta) };
}

describe("confirmação de senha nas ações sensíveis", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sem pedido do servidor, roda a ação direto e não pergunta nada", async () => {
    const d = dialogo("x");
    expect(await comConfirmacaoDeSenha(d, async () => "ok")).toBe("ok");
    expect(d.pedirTexto).not.toHaveBeenCalled();
  });

  it("quando o servidor pede, pergunta a senha, confirma e tenta de novo", async () => {
    const d = dialogo("minha-senha");
    const reautenticar = vi.spyOn(api, "reautenticar").mockResolvedValue({ ok: true });
    const acao = vi.fn().mockRejectedValueOnce(pedeSenha).mockResolvedValueOnce("feito");
    expect(await comConfirmacaoDeSenha(d, acao)).toBe("feito");
    expect(reautenticar).toHaveBeenCalledWith("minha-senha");
    expect(acao).toHaveBeenCalledTimes(2);
    expect(d.pedirTexto.mock.calls[0][0]).toMatchObject({ titulo: "Confirme sua senha", senha: true });
  });

  it("se a pessoa cancelar, não confirma nem repete; outros erros passam adiante", async () => {
    const reautenticar = vi.spyOn(api, "reautenticar");
    expect(await comConfirmacaoDeSenha(dialogo(null), () => Promise.reject(pedeSenha))).toBeNull();
    expect(reautenticar).not.toHaveBeenCalled();
    const outro = new ErroApi({ codigo: "nao_encontrado", mensagem: "Backup não encontrado.", podeTentarDeNovo: false }, 404);
    await expect(comConfirmacaoDeSenha(dialogo("x"), () => Promise.reject(outro))).rejects.toBe(outro);
  });
});

describe("arquivo dos códigos de recuperação", () => {
  it("traz a conta, a explicação e um código por linha", () => {
    const t = textoDosCodigos(["abcde-fghij", "klmno-pqrst"], "qa@exemplo.dev");
    expect(t.split("\n")).toEqual([
      "Issue Doc Generator: códigos de recuperação",
      "Conta: qa@exemplo.dev",
      "Cada código vale uma vez, no lugar do código do aplicativo.",
      "",
      "abcde-fghij",
      "klmno-pqrst",
      "",
    ]);
  });
});
