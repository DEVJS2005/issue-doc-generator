import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IssueSchema } from "../issue/schema.js";
import { formatarRefinamento } from "../prompt/entrada.js";
import { CorpoGerar, responderComGeracao, type OpcoesRotaGerar } from "./gerar.js";

export const LIMITE_AJUSTE = 2000;

export const CorpoRefinar = z.object({
  entrada: CorpoGerar,
  issue: IssueSchema,
  ajuste: z
    .string()
    .trim()
    .min(1, "Escreva o ajuste que você quer.")
    .max(LIMITE_AJUSTE, `O ajuste pode ter até ${LIMITE_AJUSTE} caracteres.`),
});

/** POST /api/refinar: devolve a issue inteira com só o ajuste aplicado (e a lista do que mudou). */
export function registrarRotaRefinar(app: FastifyInstance, o: OpcoesRotaGerar) {
  app.post("/api/refinar", async (request, reply) => {
    const corpo = CorpoRefinar.safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({
        erro: { codigo: "entrada_invalida", mensagem: corpo.error.issues[0]?.message ?? "Entrada inválida.", podeTentarDeNovo: false },
      });
    }
    const { entrada, issue, ajuste } = corpo.data;
    const logExtra: Record<string, unknown> = {
      tipo: entrada.tipo,
      produto: entrada.produto,
      caracteresAjuste: ajuste.length,
      ...(o.config.registrarDescricao ? { ajuste } : {}),
    };
    await responderComGeracao(app, reply, {
      ...o,
      usuario: formatarRefinamento(entrada, issue, ajuste),
      tipoPedido: "refinar",
      logExtra,
      issueAnterior: issue,
    });
  });
}
