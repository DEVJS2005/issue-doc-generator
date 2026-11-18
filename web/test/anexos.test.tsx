import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Anexos, lerAnexo, useAnexos } from "../src/Anexos";

// PNG de 1×1 pixel, de verdade.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const png = (nome: string) => new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))], nome, { type: "image/png" });

function Teste({ aoEnviar }: { aoEnviar: (v: unknown) => void }) {
  const a = useAnexos();
  return (
    <>
      <Anexos anexos={a.anexos} aoAdicionar={(f) => void a.adicionar(f)} aoRemover={a.remover} desabilitado={false} />
      {a.erro && <p role="alert">{a.erro}</p>}
      <button type="button" onClick={() => aoEnviar(a.paraEnvio())}>
        Enviar
      </button>
    </>
  );
}

describe("anexos", () => {
  it("lê o PNG em base64 sem o prefixo data: e guarda a prévia", async () => {
    const a = await lerAnexo(png("tela.png"));
    expect(typeof a).not.toBe("string");
    if (typeof a === "string") return;
    expect(a.tipo).toBe("image/png");
    expect(a.dados).toBe(PNG);
    expect(a.previa.startsWith("blob:")).toBe(true);
  });

  it("recusa tipo que não é imagem aceita", async () => {
    expect(await lerAnexo(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }))).toMatch(/não é PNG, JPEG, WebP ou GIF/);
  });

  it("anexa pelo botão, mostra a prévia, remove e respeita o limite de 3", async () => {
    let enviado: unknown = null;
    const usuario = userEvent.setup();
    render(<Teste aoEnviar={(v) => (enviado = v)} />);
    const campo = screen.getByLabelText("Escolher imagens");

    await usuario.upload(campo, [png("a.png"), png("b.png")]);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    await usuario.click(screen.getByRole("button", { name: "Remover a.png" }));
    expect(screen.getAllByRole("img")).toHaveLength(1);

    await usuario.upload(campo, [png("c.png"), png("d.png"), png("e.png")]);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(3));
    expect(screen.getByRole("alert")).toHaveTextContent("Anexe até 3 imagens.");
    expect(screen.getByRole("button", { name: "Anexar print" })).toBeDisabled();

    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    expect(enviado).toEqual([
      { tipo: "image/png", dados: PNG },
      { tipo: "image/png", dados: PNG },
      { tipo: "image/png", dados: PNG },
    ]);
  });
});
