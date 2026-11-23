import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IssueSchema } from "../issue/schema.js";
import { formatarRefinamento, type Entrada } from "../prompt/entrada.js";
import { CorpoGerar, responderComGeracao, type OpcoesRotaGerar } from "./gerar.js";
import { podeVer } from "./historico.js";

export const LIMITE_AJUSTE = 2000;

export const CorpoRefinar = z.object({
  entrada: CorpoGerar,
  issue: IssueSchema,
  ajuste: z
    .string()
    .trim()
    .min(1, "Escreva o ajuste que você quer.")
    .max(LIMITE_AJUSTE, `O ajuste pode ter até ${LIMITE_AJUSTE} caracteres.`),
  /** Issue do histórico que está sendo refinada; sem ele, o resultado vira uma issue nova. */
  historicoId: z.number().int().positive().nullable().optional(),
  /** Versão da issue do histórico que a tela está mostrando (obrigatória com historicoId). */
  versao: z.number().int().positive().optional(),
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
    const { ajuste } = corpo.data;
    let entrada: Entrada = corpo.data.entrada;
    let issue = corpo.data.issue;
    // Só refina no histórico uma issue que a pessoa pode ver; senão, guarda como nova.
    const historicoId = corpo.data.historicoId && podeVer(request, o.historico.dono(corpo.data.historicoId)) ? corpo.data.historicoId : null;
    if (historicoId) {
      // A base do refinamento é a versão atual e a entrada guardadas no histórico, não o que veio
      // no pedido. Se a tela estiver numa versão antiga, recusa para não sobrescrever a mais nova.
      const guardada = o.historico.obter(historicoId)!;
      if (corpo.data.versao !== guardada.versoes) {
        return reply.code(409).send({
          erro: {
            codigo: "versao_desatualizada",
            mensagem: `Esta issue mudou e agora está na versão ${guardada.versoes}. Abra de novo pelo histórico para refinar a versão atual.`,
            podeTentarDeNovo: false,
          },
          versaoAtual: guardada.versoes,
        });
      }
      const entradaGuardada = CorpoGerar.safeParse(guardada.entrada);
      entrada = entradaGuardada.success ? entradaGuardada.data : guardada.entrada;
      issue = guardada.issue;
    }
    const logExtra: Record<string, unknown> = {
      tipo: entrada.tipo,
      produto: entrada.produto,
      caracteresAjuste: ajuste.length,
      historicoId,
      ...(o.config.registrarDescricao ? { ajuste } : {}),
    };
    await responderComGeracao(app, reply, {
      ...o,
      usuario: formatarRefinamento(entrada, issue, ajuste),
      tipoPedido: "refinar",
      logExtra,
      entrada,
      refinamento: { issueAnterior: issue, ajuste, historicoId },
    });
  });
}
