import type { Issue } from "./schema.js";

const ROTULOS: Record<keyof Issue, string> = {
  titulo: "Título",
  tipo: "Tipo",
  produto: "Produto",
  modulo: "Módulo/Tela",
  perfis: "Perfis afetados",
  prioridade: "Prioridade",
  problema: "Problema",
  solucao: "Solução",
  contexto: "Contexto e Objetivo",
  estados: "Estados / Ciclo de vida",
  regras: "Regras de Negócio",
  fluxo_decisao: "Fluxo de decisão",
  interface: "Interface",
  mensagens: "Mensagens",
  escopo: "Escopo e impacto",
  fora_de_escopo: "Fora de escopo",
  criterios: "Critérios de Aceite",
  casos: "Casos de teste",
  revisao: "Revisão da task",
};

/** Partes da issue que mudaram no refinamento, para a pessoa conferir que só mudou o pedido. */
export function partesAlteradas(antes: Issue, depois: Issue): string[] {
  return (Object.keys(ROTULOS) as (keyof Issue)[])
    .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
    .map((k) => ROTULOS[k]);
}
