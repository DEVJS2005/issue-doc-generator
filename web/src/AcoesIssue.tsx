import { useCallback, useEffect, useState } from "react";
import { api, ErroApi, rotuloStatus, STATUS, type LinkCompartilhado, type MudancaStatus, type StatusIssue } from "./api";
import { useDialogo } from "./Dialogo";
import { EnviarJira } from "./EnviarJira";
import { dataHora } from "./Historico";

const VALIDADES = [
  { dias: 1, rotulo: "1 dia" },
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
];

/**
 * Status (Rascunho → Revisada → Aprovada, com quem mudou e quando) e links de compartilhamento
 * só de leitura de uma issue do histórico. `atualizacao` muda a cada refinamento e recarrega tudo:
 * refinar uma issue revisada ou aprovada a devolve para rascunho.
 */
export function AcoesIssue({ historicoId, atualizacao, aoSessaoExpirar }: { historicoId: number; atualizacao: string; aoSessaoExpirar: () => void }) {
  const [status, setStatus] = useState<StatusIssue | null>(null);
  const [mudancas, setMudancas] = useState<MudancaStatus[]>([]);
  const [links, setLinks] = useState<LinkCompartilhado[]>([]);
  const [dias, setDias] = useState(7);
  const [novoLink, setNovoLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const dialogo = useDialogo();

  const tratar = useCallback(
    (e: unknown) => (e instanceof ErroApi && e.status === 401 ? aoSessaoExpirar() : setErro(e instanceof Error ? e.message : "Algo deu errado.")),
    [aoSessaoExpirar],
  );

  useEffect(() => {
    setErro(null);
    Promise.all([api.issue(historicoId), api.links(historicoId)])
      .then(([i, l]) => {
        setStatus(i.item.status);
        setMudancas(i.mudancasStatus);
        setLinks(l.links);
      })
      .catch(tratar);
  }, [historicoId, atualizacao, tratar]);

  async function mudarStatus(novo: StatusIssue) {
    try {
      const r = await api.mudarStatus(historicoId, novo);
      setStatus(r.status);
      setMudancas(r.mudancasStatus);
    } catch (e) {
      tratar(e);
    }
  }

  async function criarLink() {
    try {
      const r = await api.criarLink(historicoId, dias);
      setNovoLink(`${window.location.origin}${r.url}`);
      setCopiado(false);
      setLinks((atual) => [r.link, ...atual]);
    } catch (e) {
      tratar(e);
    }
  }

  async function copiar() {
    if (!novoLink) return;
    await navigator.clipboard.writeText(novoLink).catch(() => undefined);
    setCopiado(true);
  }

  async function revogar(link: LinkCompartilhado) {
    const ok = await dialogo.confirmar({
      titulo: "Revogar este link?",
      mensagem: "Quem tiver o link deixa de conseguir abrir a issue na hora. Não dá para desfazer.",
      acao: "Revogar",
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.revogarLink(historicoId, link.id);
      setLinks((atual) => atual.filter((l) => l.id !== link.id));
      setNovoLink(null);
    } catch (e) {
      tratar(e);
    }
  }

  if (status === null) return erro ? <p className="erro">{erro}</p> : null;
  const ultima = mudancas.at(-1);

  return (
    <div className="acoes-issue nao-imprimir">
      <div className="status-issue">
        <label>
          Status
          <select aria-label="Status da issue" value={status} onChange={(e) => mudarStatus(e.target.value as StatusIssue)}>
            {STATUS.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>
        {ultima && (
          <p className="legenda">
            {rotuloStatus(ultima.para)} por {ultima.quem} em {dataHora(ultima.quando)}.
          </p>
        )}
        {mudancas.length > 1 && (
          <details>
            <summary>Histórico do status</summary>
            <ul className="lista-status">
              {mudancas.map((m, i) => (
                <li key={i}>
                  {dataHora(m.quando)} · {m.quem}: {rotuloStatus(m.de)} → {rotuloStatus(m.para)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="compartilhar">
        <div className="linha-acoes">
          <label>
            Validade do link
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {VALIDADES.map((v) => (
                <option key={v.dias} value={v.dias}>
                  {v.rotulo}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secundario" onClick={criarLink}>
            Criar link de leitura
          </button>
        </div>
        {novoLink && (
          <div className="linha-acoes">
            <input aria-label="Link de compartilhamento" readOnly value={novoLink} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="secundario pequeno" onClick={copiar}>
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        )}
        {novoLink && <p className="legenda">Quem tiver o link vê só esta issue, sem precisar de login. Guarde-o agora: ele não aparece de novo.</p>}
        {links.length > 0 && (
          <ul className="lista-links" aria-label="Links ativos">
            {links.map((l) => (
              <li key={l.id}>
                <span>
                  Link de {l.criadoPor}, vence em {dataHora(l.expiraEm)}
                </span>
                <button type="button" className="botao-texto" onClick={() => revogar(l)}>
                  Revogar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <EnviarJira historicoId={historicoId} aoFalhar={tratar} />
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
