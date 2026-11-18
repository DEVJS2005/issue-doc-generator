import type { Qualidade } from "./api";

export const ROTULO_NIVEL: Record<Qualidade["nivel"], string> = {
  pronta: "Pronta para o time",
  quase: "Quase pronta",
  revisar: "Precisa de revisão",
};

/**
 * Nota de qualidade (INVEST e ISTQB), calculada no servidor sem chamar a IA de novo. Fechada, mostra
 * a nota e quantos pontos faltam; aberta, cada grupo com o que passou e a sugestão do que falta.
 */
export function NotaQualidade({ qualidade }: { qualidade: Qualidade }) {
  const faltam = qualidade.grupos.flatMap((g) => g.itens).filter((i) => !i.ok).length;
  return (
    <details className={`qualidade qualidade-${qualidade.nivel} nao-imprimir`}>
      <summary>
        <span className="qualidade-nota" aria-label={`Nota ${qualidade.nota} de 100`}>
          {qualidade.nota}
        </span>
        <span className="qualidade-resumo">
          <strong>{ROTULO_NIVEL[qualidade.nivel]}</strong>
          <span>{faltam === 0 ? "Passou em todas as checagens INVEST e ISTQB." : `${faltam} ponto(s) para melhorar. Abra para ver as sugestões.`}</span>
        </span>
        <span className="qualidade-barra" aria-hidden="true">
          <span style={{ width: `${qualidade.nota}%` }} />
        </span>
      </summary>
      <div className="qualidade-grupos">
        {qualidade.grupos.map((g) => (
          <section key={g.id}>
            <h4>
              {g.titulo} <span className="qualidade-grupo-nota">{g.nota}</span>
            </h4>
            <ul>
              {g.itens.map((i) => (
                <li key={i.texto} className={i.ok ? "ok" : "falta"}>
                  <span aria-hidden="true">{i.ok ? "✓" : "!"}</span>
                  <span>
                    <span className="sr">{i.ok ? "Passou: " : "Falta: "}</span>
                    {i.ok ? i.texto : i.sugestao}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
