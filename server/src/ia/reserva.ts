import { normalizarErro, type CodigoErro } from "./erros.js";
import type { Provedor } from "./tipos.js";

// Erros em que vale tentar outro modelo: sobrecarga e limite de taxa costumam ser por modelo.
const COM_RESERVA = new Set<CodigoErro>(["servidor", "limite_taxa"]);

/**
 * Tenta o modelo principal; se ele estiver sobrecarregado (503/5xx) ou no limite de taxa, refaz o
 * pedido no modelo reserva. Cancelamento e tempo esgotado não disparam a reserva.
 */
export function comReserva(principal: Provedor, reserva: Provedor, aoUsarReserva?: (motivo: CodigoErro) => void): Provedor {
  return {
    nome: principal.nome,
    modelo: principal.modelo,
    async gerar(pedido, opcoes) {
      try {
        return await principal.gerar(pedido, opcoes);
      } catch (erro) {
        const e = normalizarErro(erro, opcoes.signal);
        if (opcoes.signal.aborted || !COM_RESERVA.has(e.codigo)) throw e;
        aoUsarReserva?.(e.codigo);
        opcoes.aoProgresso({ fase: "analisando" });
        const r = await reserva.gerar(pedido, opcoes);
        return { ...r, usouFallback: true };
      }
    },
  };
}
