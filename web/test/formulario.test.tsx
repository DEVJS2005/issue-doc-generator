import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { ERRO_NOME, PADRAO_NOME, useValidacao } from "../src/Formulario";

function Exemplo({ aoEnviar }: { aoEnviar: () => void }) {
  const v = useValidacao();
  const [email, setEmail] = useState("");
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (v.validar(e.currentTarget)) aoEnviar();
  }
  return (
    <form noValidate onSubmit={enviar}>
      <label>
        Nome
        <input {...v.campo("nome")} pattern={PADRAO_NOME} data-erro={ERRO_NOME} />
        {v.erro("nome")}
      </label>
      <label>
        E-mail
        <input {...v.campo("email")} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {v.erro("email")}
      </label>
      <label>
        Senha
        <input {...v.campo("senha")} type="password" minLength={8} required />
        {v.erro("senha")}
      </label>
      <label>
        Limite
        <input {...v.campo("limite")} type="number" min={1} max={10} defaultValue={5} />
        {v.erro("limite")}
      </label>
      <button type="submit">Enviar</button>
    </form>
  );
}

function montar() {
  const aoEnviar = vi.fn();
  render(<Exemplo aoEnviar={aoEnviar} />);
  return { aoEnviar, usuario: userEvent.setup() };
}

describe("useValidacao", () => {
  it("campos obrigatórios vazios: mensagem do sistema, aria-invalid e foco no primeiro", async () => {
    const { aoEnviar, usuario } = montar();
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    const email = screen.getByRole("textbox", { name: "E-mail" });
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Preencha este campo.");
    expect(email).toHaveFocus();
    expect(screen.getByLabelText(/^Senha/)).toHaveAccessibleDescription("Preencha este campo.");
    // Campo opcional vazio não acusa erro.
    expect(screen.getByRole("textbox", { name: "Nome" })).not.toHaveAttribute("aria-invalid");
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it("e-mail, tamanho mínimo, formato e faixa numérica têm mensagens próprias", async () => {
    const { usuario } = montar();
    await usuario.type(screen.getByRole("textbox", { name: "Nome" }), "Maiúsculo!");
    await usuario.type(screen.getByRole("textbox", { name: "E-mail" }), "sem-arroba");
    await usuario.type(screen.getByLabelText(/^Senha/), "curta");
    const limite = screen.getByRole("spinbutton", { name: "Limite" });
    await usuario.clear(limite);
    await usuario.type(limite, "50");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveAccessibleDescription(ERRO_NOME);
    expect(screen.getByRole("textbox", { name: "E-mail" })).toHaveAccessibleDescription("Digite um e-mail válido, como nome@empresa.com.");
    expect(screen.getByLabelText(/^Senha/)).toHaveAccessibleDescription("Use pelo menos 8 caracteres.");
    expect(limite).toHaveAccessibleDescription("Use um valor entre 1 e 10.");
  });

  it("a mensagem some quando a pessoa volta a digitar no campo", async () => {
    const { usuario } = montar();
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    const email = screen.getByRole("textbox", { name: "E-mail" });
    await usuario.type(email, "a");
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText(/^Senha/)).toHaveAttribute("aria-invalid", "true");
  });

  it("formulário válido é enviado", async () => {
    const { aoEnviar, usuario } = montar();
    await usuario.type(screen.getByRole("textbox", { name: "Nome" }), "ana.souza");
    await usuario.type(screen.getByRole("textbox", { name: "E-mail" }), "ana@empresa.com");
    await usuario.type(screen.getByLabelText(/^Senha/), "senha-longa");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    expect(aoEnviar).toHaveBeenCalledOnce();
  });

  it("o padrão do nome segue a regra do servidor", () => {
    const regra = new RegExp(`^(?:${PADRAO_NOME})$`);
    for (const ok of ["ana", "ana.souza", "qa-2", "a1", "x_y"]) expect(regra.test(ok), ok).toBe(true);
    for (const ruim of ["a", "Ana", ".ana", "ana souza", "ana@x", "a".repeat(41)]) expect(regra.test(ruim), ruim).toBe(false);
  });

  it("campo obrigatório pode explicar o que falta com data-vazio", async () => {
    function Modelo() {
      const v = useValidacao();
      return (
        <form noValidate onSubmit={(e) => (e.preventDefault(), v.validar(e.currentTarget))}>
          <label>
            Modelo
            <input {...v.campo("modelo")} required data-vazio="Escolha o modelo." />
            {v.erro("modelo")}
          </label>
          <button type="submit">Salvar</button>
        </form>
      );
    }
    render(<Modelo />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("textbox", { name: "Modelo" })).toHaveAccessibleDescription("Escolha o modelo.");
  });
});
