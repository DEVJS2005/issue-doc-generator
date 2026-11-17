import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProvedorDialogo, useDialogo } from "../src/Dialogo";

type Abrir = (d: ReturnType<typeof useDialogo>) => Promise<unknown>;

function montar(abrir: Abrir) {
  const respostas: unknown[] = [];
  function Botao() {
    const d = useDialogo();
    return (
      <button type="button" onClick={async () => respostas.push(await abrir(d))}>
        Abrir
      </button>
    );
  }
  render(
    <ProvedorDialogo>
      <Botao />
    </ProvedorDialogo>,
  );
  return { respostas, usuario: userEvent.setup() };
}

const confirmarApagar: Abrir = (d) => d.confirmar({ titulo: "Apagar esta issue?", mensagem: "Não dá para desfazer.", acao: "Apagar", perigo: true });

describe("diálogo do sistema", () => {
  it("confirmar: Cancelar começa com o foco (ação destrutiva) e responde false", async () => {
    const { respostas, usuario } = montar(confirmarApagar);
    await usuario.click(screen.getByRole("button", { name: "Abrir" }));

    const dialogo = screen.getByRole("dialog", { name: "Apagar esta issue?" });
    expect(dialogo).toHaveAccessibleDescription("Não dá para desfazer.");
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Apagar" })).toHaveClass("perigo");

    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(respostas).toEqual([false]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirmar: o botão da ação responde true", async () => {
    const { respostas, usuario } = montar(confirmarApagar);
    await usuario.click(screen.getByRole("button", { name: "Abrir" }));
    await usuario.click(screen.getByRole("button", { name: "Apagar" }));
    await waitFor(() => expect(respostas).toEqual([true]));
  });

  it("Esc fecha como Cancelar", async () => {
    const { respostas, usuario } = montar(confirmarApagar);
    await usuario.click(screen.getByRole("button", { name: "Abrir" }));
    screen.getByRole("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(respostas).toEqual([false]));
  });

  it("pedir texto: valida antes de responder e normaliza o valor", async () => {
    const { respostas, usuario } = montar((d) =>
      d.pedirTexto({
        titulo: "Trocar o nome de usuário",
        rotulo: "Nome de usuário",
        valor: "bia",
        padrao: "[a-z0-9][a-z0-9._\\-]{1,39}",
        erroPadrao: "Formato inválido de nome.",
        normalizar: (v) => v.trim().toLowerCase(),
        acao: "Salvar nome",
      }),
    );
    await usuario.click(screen.getByRole("button", { name: "Abrir" }));
    const campo = screen.getByRole("textbox", { name: "Nome de usuário" });
    expect(campo).toHaveValue("bia");
    expect(campo).toHaveFocus();

    await usuario.clear(campo);
    await usuario.click(screen.getByRole("button", { name: "Salvar nome" }));
    expect(campo).toHaveAccessibleDescription("Preencha este campo.");
    expect(respostas).toEqual([]);

    await usuario.type(campo, "Bia.Souza");
    await usuario.click(screen.getByRole("button", { name: "Salvar nome" }));
    await waitFor(() => expect(respostas).toEqual(["bia.souza"]));
  });

  it("pedir texto: senha curta é recusada; Cancelar responde null", async () => {
    const { respostas, usuario } = montar((d) => d.pedirTexto({ titulo: "Trocar a senha", rotulo: "Nova senha", senha: true, minimo: 8, acao: "Trocar senha" }));
    await usuario.click(screen.getByRole("button", { name: "Abrir" }));
    const campo = screen.getByLabelText(/^Nova senha/);
    expect(campo).toHaveAttribute("type", "password");
    await usuario.type(campo, "curta");
    await usuario.click(screen.getByRole("button", { name: "Trocar senha" }));
    expect(campo).toHaveAccessibleDescription("Use pelo menos 8 caracteres.");

    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(respostas).toEqual([null]));
  });

  it("useDialogo fora do provedor falha alto", () => {
    function Solto() {
      useDialogo();
      return null;
    }
    expect(() => render(<Solto />)).toThrow(/ProvedorDialogo/);
  });
});
