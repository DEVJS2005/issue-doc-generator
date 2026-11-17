import { useCallback, useEffect, useState } from "react";
import { api, ErroApi, type BuscaHistorico, type IssueGuardada, type ResumoIssue } from "./api";
import { useDialogo } from "./Dialogo";

export function dataHora(ms: number) {
  return new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

type Filtros = Omit<BuscaHistorico, "todos">;
const SEM_FILTROS: Filtros = { usuario: "", texto: "", produto: "", tipo: "", de: "", ate: "" };

/**
 * Lista as issues guardadas, com busca por texto e filtros por produto, tipo e período. O admin
 * pode ver as de todos e filtrar por pessoa.
 */
export function Historico({
  podeVerTodos,
  aoAbrir,
  aoUsarComoBase,
  aoSessaoExpirar,
}: {
  podeVerTodos: boolean;
  aoAbrir: (item: IssueGuardada) => void;
  aoUsarComoBase: (item: IssueGuardada) => void;
  aoSessaoExpirar: () => void;
}) {
  const [itens, setItens] = useState<ResumoIssue[] | null>(null);
  const [produtos, setProdutos] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [todos, setTodos] = useState(false);
  const dialogo = useDialogo();
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS);
  // O texto digitado só vira busca depois de uma pausa, para não pedir a cada tecla.
  const [busca, setBusca] = useState<Filtros>(SEM_FILTROS);
  const [erro, setErro] = useState<string | null>(null);

  const tratar = useCallback(
    (e: unknown) => (e instanceof ErroApi && e.status === 401 ? aoSessaoExpirar() : setErro(e instanceof Error ? e.message : "Algo deu errado.")),
    [aoSessaoExpirar],
  );

  useEffect(() => {
    const t = setTimeout(() => setBusca(filtros), 300);
    return () => clearTimeout(t);
  }, [filtros]);

  useEffect(() => {
    api
      .opcoes()
      .then((o) => setTipos(o.tipos))
      .catch(() => undefined);
  }, []);

  const carregar = useCallback(() => {
    setErro(null);
    api
      .historico({ todos, ...busca })
      .then((r) => {
        setItens(r.itens);
        setProdutos(r.produtos);
      })
      .catch(tratar);
  }, [todos, busca, tratar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const mudar = (campo: keyof Filtros, valor: string) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const filtrando = Object.values(filtros).some((v) => v);

  async function obter(id: number, depois: (item: IssueGuardada) => void) {
    try {
      depois((await api.issue(id)).item);
    } catch (e) {
      tratar(e);
    }
  }

  async function apagar(item: ResumoIssue) {
    const ok = await dialogo.confirmar({
      titulo: "Apagar esta issue?",
      mensagem: (
        <>
          <strong>{item.titulo}</strong> e todas as versões dela saem do histórico. Não dá para desfazer.
        </>
      ),
      acao: "Apagar",
      perigo: true,
    });
    if (!ok) return;
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
          <label className="opcao">
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
            Ver de todos
          </label>
        )}
      </div>

      <div className="busca" role="search">
        <label className="busca-texto">
          Buscar
          <input
            type="search"
            value={filtros.texto}
            onChange={(e) => mudar("texto", e.target.value)}
            placeholder="Título, produto ou texto da issue"
          />
        </label>
        <label>
          Produto
          <input list="produtos-historico" value={filtros.produto} onChange={(e) => mudar("produto", e.target.value)} placeholder="Todos" />
          <datalist id="produtos-historico">
            {produtos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label>
          Tipo
          <select value={filtros.tipo} onChange={(e) => mudar("tipo", e.target.value)}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        {podeVerTodos && todos && (
          <label>
            Autor
            <input value={filtros.usuario} onChange={(e) => mudar("usuario", e.target.value)} placeholder="Usuário ou e-mail" />
          </label>
        )}
        <label>
          De
          <input type="date" value={filtros.de} max={filtros.ate || undefined} onChange={(e) => mudar("de", e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={filtros.ate} min={filtros.de || undefined} onChange={(e) => mudar("ate", e.target.value)} />
        </label>
        {filtrando && (
          <button type="button" className="botao-texto" onClick={() => setFiltros(SEM_FILTROS)}>
            Limpar filtros
          </button>
        )}
      </div>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {itens === null && !erro && <p className="carregando">Carregando…</p>}
      {itens?.length === 0 && (
        <p className="legenda">
          {filtrando ? "Nenhuma issue encontrada com esses filtros." : "Nenhuma issue guardada ainda. As que você gerar aparecem aqui."}
        </p>
      )}
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
                  {todos && <td title={i.usuario}>{i.autor ?? i.usuario}</td>}
                  <td>{dataHora(i.atualizadaEm)}</td>
                  <td>{i.versoes}</td>
                  <td className="acoes-linha">
                    <button type="button" className="secundario pequeno" onClick={() => obter(i.id, aoAbrir)}>
                      Abrir
                    </button>
                    <button
                      type="button"
                      className="botao-texto"
                      title="Abre uma issue nova com a mesma descrição, tipo, produto e contexto"
                      onClick={() => obter(i.id, aoUsarComoBase)}
                    >
                      Usar como base
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
