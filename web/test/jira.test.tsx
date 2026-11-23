import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../src/api";
import { EnviarJira } from "../src/EnviarJira";

describe("criar no Jira", () => {
  it("sem projeto liberado, avisa para falar com o administrador", async () => {
    vi.spyOn(api, "jira").mockResolvedValue({ ligado: true, url: null });
    vi.spyOn(api, "envioJira").mockResolvedValue({ envio: null });
    vi.spyOn(api, "projetosJira").mockResolvedValue({ projetos: [] });
    render(<EnviarJira historicoId={1} aoFalhar={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Criar no Jira" }));
    expect(await screen.findByText("Nenhum projeto do Jira liberado. Fale com o administrador.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar issue no Jira" })).toBeDisabled();
  });
});
