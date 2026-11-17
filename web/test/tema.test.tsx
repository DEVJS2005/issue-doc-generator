import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Rodape, SeletorTema } from "../src/Interface";

describe("tema claro e escuro", () => {
  it("começa no tema do sistema, sem forçar data-theme", () => {
    render(<SeletorTema />);
    expect(screen.getByRole("button", { name: "Tema do sistema" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("escuro e claro forçam o tema e ficam salvos no navegador", async () => {
    const usuario = userEvent.setup();
    render(<SeletorTema />);
    await usuario.click(screen.getByRole("button", { name: "Tema escuro" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("idg:tema")).toBe("escuro");

    await usuario.click(screen.getByRole("button", { name: "Tema claro" }));
    expect(document.documentElement.dataset.theme).toBe("light");

    await usuario.click(screen.getByRole("button", { name: "Tema do sistema" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("lembra o tema salvo", () => {
    localStorage.setItem("idg:tema", "escuro");
    render(<SeletorTema />);
    expect(screen.getByRole("button", { name: "Tema escuro" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("rodapé", () => {
  it("mostra o crédito com link seguro para o GitHub", () => {
    render(<Rodape />);
    const link = screen.getByRole("link", { name: /JSBATIS/ });
    expect(link).toHaveAttribute("href", "https://github.com/DEVJS2005");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
