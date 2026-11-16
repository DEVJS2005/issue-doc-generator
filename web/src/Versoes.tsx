import { useEffect, useState } from "react";
import { api, type Versao } from "./api";
import { diffLinhas, type LinhaDiff } from "./diff";
import { dataHora } from "./Historico";

/**
 * Compara duas versões de uma issue do histórico (1 = geração; as seguintes, refinamentos),
 * linha a linha no Markdown. Por padrão, a penúltima contra a última.
 */
export function Versoes({ historicoId, atualizacao }: { historicoId: number; atualizacao: string }) {
  const [aberto, setAberto] = useState(false);
  const [versoes, setVersoes] = useState<Versao[] | null>(null);
  const [de, setDe] = useState(0);
  const [para, setPara] = useState(0);
  const [linhas, setLinhas] = useState<LinhaDiff[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Recarrega a lista quando a issue muda (novo refinamento).
  useEffect(() => {
    if (!aberto) return;
    api
      .issue(historicoId)
      .then((r) => {
        setVersoes(r.versoes);
        const n = r.versoes.length;
        setPara(n);
        setDe(Math.max(1, n - 1));
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar as versões."));
  }, [aberto, historicoId, atualizacao]);

  useEffect(() => {
    if (!aberto || !de || !para || de === para) {
      setLinhas(null);
      return;
    }
    Promise.all([api.versao(historicoId, de), api.versao(historicoId, para)])
      .then(([a, b]) => setLinhas(diffLinhas(a.versao.markdown, b.versao.markdown)))
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível comparar."));
  }, [aberto, historicoId, de, para]);

  if (!aberto) {
    return (
      <button type="button" className="botao-texto" onClick={() => setAberto(true)}>
        Comparar versões
      </button>
    );
  }

  const nome = (v: Versao) => `Versão ${v.numero} · ${dataHora(v.quando)}${v.numero === 1 ? " (geração)" : ""}`;
  const alvo = versoes?.find((v) => v.numero === para);
  const mudou = linhas?.filter((l) => l.tipo !== "igual").length ?? 0;

  return (
    <section className="versoes" aria-label="Comparar versões">
      <div className="barra">
        <h3>Comparar versões</h3>
        <button type="button" className="botao-texto" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </div>
      {erro && (
        <p className="erro caixa" role="alert">
          {erro}
        </p>
      )}
      {versoes && versoes.length < 2 && <p className="legenda">Esta issue ainda não foi refinada: só existe a versão 1.</p>}
      {versoes && versoes.length >= 2 && (
        <>
          <div className="linha">
            <label>
              De
              <select value={de} onChange={(e) => setDe(Number(e.target.value))}>
                {versoes.map((v) => (
                  <option key={v.numero} value={v.numero}>
                    {nome(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Para
              <select value={para} onChange={(e) => setPara(Number(e.target.value))}>
                {versoes.map((v) => (
                  <option key={v.numero} value={v.numero}>
                    {nome(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {alvo?.ajuste && (
            <p className="legenda">
              Ajuste pedido na versão {alvo.numero}: “{alvo.ajuste}”
            </p>
          )}
          {de === para && <p className="legenda">Escolha duas versões diferentes.</p>}
          {linhas && (
            <>
              <p className="legenda">{mudou ? `${mudou} linha(s) diferente(s).` : "As duas versões são iguais."}</p>
              <pre className="diff">
                {linhas.map((l, i) => (
                  <div key={i} className={`diff-${l.tipo}`}>
                    <span aria-hidden="true">{l.tipo === "adicionada" ? "+ " : l.tipo === "removida" ? "− " : "  "}</span>
                    <span className="sr">{l.tipo === "adicionada" ? "Adicionada: " : l.tipo === "removida" ? "Removida: " : ""}</span>
                    {l.texto}
                  </div>
                ))}
              </pre>
            </>
          )}
        </>
      )}
    </section>
  );
}
