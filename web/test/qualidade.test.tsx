import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Qualidade } from "../src/api";
import { NotaQualidade } from "../src/Qualidade";

const qualidade: Qualidade = {
  nota: 75,
  nivel: "quase",
  grupos: [
    {
      id: "criterios",
      titulo: "Critérios de aceite (INVEST: testável)",
      nota: 50,
      itens: [
        { texto: "Critérios sem termos vagos", ok: false, sugestao: "Troque termos vagos em CA1." },
        { texto: "Todo critério tem caso de teste feliz", ok: true, sugestao: null },
      ],
    },
  ],
};

describe("nota de qualidade na tela", () => {
  it("mostra nota, nível e quantos pontos faltam; abre com as sugestões", async () => {
    render(<NotaQualidade qualidade={qualidade} />);
    expect(screen.getByLabelText("Nota 75 de 100")).toHaveTextContent("75");
    expect(screen.getByText("Quase pronta")).toBeInTheDocument();
    expect(screen.getByText(/1 ponto\(s\) para melhorar/)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByText("Quase pronta"));
    expect(screen.getByText("Troque termos vagos em CA1.")).toBeVisible();
    expect(screen.getByText("Todo critério tem caso de teste feliz")).toBeVisible();
    expect(screen.queryByText("Critérios sem termos vagos")).not.toBeInTheDocument();
  });

  it("sem pendências, diz que passou em tudo", () => {
    render(<NotaQualidade qualidade={{ ...qualidade, nota: 100, nivel: "pronta", grupos: [{ ...qualidade.grupos[0], nota: 100, itens: [qualidade.grupos[0].itens[1]] }] }} />);
    expect(screen.getByText("Pronta para o time")).toBeInTheDocument();
    expect(screen.getByText("Passou em todas as checagens INVEST e ISTQB.")).toBeInTheDocument();
  });
});
