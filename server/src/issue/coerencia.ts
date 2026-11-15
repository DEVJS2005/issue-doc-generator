import type { Issue } from "./schema.js";

// Verificações que o JSON Schema não expressa, tiradas dos critérios de aceite do projeto.
// Não bloqueiam a resposta: viram avisos na tela para a pessoa que revisa.

export type Aviso = { codigo: string; mensagem: string };

export function verificarCoerencia(issue: Issue): Aviso[] {
  const avisos: Aviso[] = [];
  const idsCriterios = new Set(issue.criterios.map((c) => c.id));
  const idsRegras = new Set(issue.regras.map((r) => r.id));

  for (const c of issue.criterios) {
    const temFeliz = issue.casos.some((k) => k.criterio === c.id && k.tipo === "feliz");
    if (!temFeliz) {
      avisos.push({ codigo: "criterio_sem_feliz", mensagem: `${c.id} não tem caso de teste feliz.` });
    }
    for (const rid of c.regras_cobertas) {
      if (!idsRegras.has(rid)) {
        avisos.push({ codigo: "regra_inexistente", mensagem: `${c.id} cita a regra ${rid}, que não existe.` });
      }
    }
  }

  for (const k of issue.casos) {
    if (!idsCriterios.has(k.criterio)) {
      avisos.push({ codigo: "caso_sem_criterio", mensagem: `${k.id} aponta para ${k.criterio}, que não existe.` });
    }
  }

  const cobertas = new Set(issue.criterios.flatMap((c) => c.regras_cobertas));
  for (const r of issue.regras) {
    if (!cobertas.has(r.id)) {
      avisos.push({ codigo: "regra_sem_criterio", mensagem: `${r.id} não é coberta por nenhum critério.` });
    }
  }

  const duplicados = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const id of new Set([
    ...duplicados(issue.criterios.map((c) => c.id)),
    ...duplicados(issue.casos.map((k) => k.id)),
    ...duplicados(issue.regras.map((r) => r.id)),
  ])) {
    avisos.push({ codigo: "id_duplicado", mensagem: `O identificador ${id} aparece mais de uma vez.` });
  }

  return avisos;
}
