import { useCallback, useEffect, useState } from "react";
import { api, ErroApi, type IssueGuardada, type ResumoIssue } from "./api";

export function dataHora(ms: number) {
  return new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Lista as issues guardadas. O admin pode ver as de todos e filtrar por pessoa. */
export function Historico({
  podeVerTodos,
  aoAbrir,
  aoSessaoExpirar,
}: {
  podeVerTodos: boolean;
  aoAbrir: (item: IssueGuardada) => void;
  aoSessaoExpirar: () => void;
}) {
  const [itens, setItens] = useState<ResumoIssue[] | null>(null);
  const [todos, setTodos] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const tratar = useCallback(
    (e: unknown) => (e instanceof ErroApi && e.status === 401 ? aoSessaoExpirar() : setErro(e instanceof Error ? e.message : "Algo deu errado.")),
    [aoSessaoExpirar],
  );

  const carregar = useCallback(() => {
    setErro(null);
    api
      .historico(todos, filtro.trim())
      .then((r) => setItens(r.itens))
      .catch(tratar);
  }, [todos, filtro, tratar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrir(id: number) {
    try {
      aoAbrir((await api.issue(id)).item);
    } catch (e) {
      tratar(e);
    }
  }

  async function apagar(item: ResumoIssue) {
    if (!window.confirm(`Apagar a issue "${item.titulo}"? Não dá para desfazer.`)) return;
    try {
      await api.apagarIssue(item.id);
      carregar();
    } catch (e) {
      tratar(e);
    }
  }

  return (
    <section className="cartao">
      <div className="barra">
        <h2>Histórico de issues</h2>
        {podeVerTodos && (
          <div className="acoes filtros">
            <label className="opcao">
              <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
              Ver de todos
            </label>
            {todos && (
              <input
                aria-label="Filtrar por e-mail"
                placeholder="Filtrar por e-mail"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            )}
          </div>
        )}
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {itens === null && !erro && <p className="carregando">Carregando…</p>}
      {itens?.length === 0 && <p className="legenda">Nenhuma issue guardada ainda. As que você gerar aparecem aqui.</p>}
      {itens && itens.length > 0 && (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Título</th>
                <th>Produto</th>
                <th>Tipo</th>
                {todos && <th>Autor</th>}
                <th>Atualizada</th>
                <th>Versões</th>
                <th>
                  <span className="sr">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td>{i.titulo}</td>
                  <td>{i.produto}</td>
                  <td>{i.tipo}</td>
                  {todos && <td>{i.usuario}</td>}
                  <td>{dataHora(i.atualizadaEm)}</td>
                  <td>{i.versoes}</td>
                  <td className="acoes-linha">
                    <button type="button" className="secundario pequeno" onClick={() => abrir(i.id)}>
                      Abrir
                    </button>
                    <button type="button" className="botao-texto" onClick={() => apagar(i)}>
                      Apagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
