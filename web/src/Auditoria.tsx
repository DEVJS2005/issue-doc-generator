import { useCallback, useEffect, useState } from "react";
import { api, type AcaoAuditoria, type EventoAuditoria } from "./api";
import { dataHora } from "./Historico";

export const ROTULO_ACAO: Record<AcaoAuditoria, string> = {
  login: "Entrou",
  login_falhou: "Login recusado",
  primeiro_admin: "Criou o 1º admin",
  gerar: "Gerou issue",
  refinar: "Refinou issue",
  status: "Mudou o status",
  apagar_issue: "Apagou issue",
  criar_link: "Criou link de leitura",
  revogar_link: "Revogou link",
  ajustes: "Salvou ajustes",
  criar_usuario: "Criou usuário",
  alterar_usuario: "Alterou usuário",
  backup: "Fez backup",
  baixar_backup: "Baixou backup",
  criar_jira: "Criou no Jira",
};

/** Detalhe em uma linha legível. Os campos vêm do servidor, já sem senhas nem tokens. */
export function descreverDetalhe(e: Pick<EventoAuditoria, "acao" | "detalhe">): string {
  const d = e.detalhe;
  if (!d) return "";
  switch (e.acao) {
    case "login_falhou":
      return `tentou como “${String(d.tentativa ?? "")}”`;
    case "gerar":
      return [d.tipo, d.produto, d.idioma && d.idioma !== "pt-BR" ? d.idioma : null].filter(Boolean).join(" · ");
    case "status":
      return `para ${String(d.para ?? "")}`;
    case "criar_jira":
      return `projeto ${String(d.projeto ?? "")}`;
    case "criar_link":
      return `válido por ${String(d.dias ?? "?")} dia(s)`;
    case "revogar_link":
      return `link ${String(d.link ?? "")}`;
    case "criar_usuario":
      return [d.nome, d.email, d.admin ? "admin" : null].filter(Boolean).join(" · ");
    case "alterar_usuario": {
      const campos = Array.isArray(d.campos) ? (d.campos as string[]) : [];
      return campos
        .map((c) => (c === "senha" ? "trocou a senha" : typeof d[c] === "boolean" ? `${c}: ${d[c] ? "sim" : "não"}` : `${c}: ${String(d[c])}`))
        .join(" · ");
    }
    default:
      return "";
  }
}

function alvo(e: EventoAuditoria) {
  if (!e.alvo) return "";
  if (e.acao === "alterar_usuario") return `usuário #${e.alvo}`;
  if (e.acao === "baixar_backup") return e.alvo;
  return `issue #${e.alvo}`;
}

const diaParaMs = (dia: string, fim = false) => (dia ? new Date(`${dia}T${fim ? "23:59:59.999" : "00:00:00"}`).getTime() : undefined);

/** Quem fez o quê: logins, gerações, mudanças em issues, usuários, ajustes e backups. */
export function Auditoria({ aoFalhar }: { aoFalhar: (e: unknown) => void }) {
  const [quem, setQuem] = useState("");
  const [acao, setAcao] = useState<AcaoAuditoria | "">("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [eventos, setEventos] = useState<EventoAuditoria[] | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);

  const buscar = useCallback(
    async (antesDe?: number) => {
      setCarregando(true);
      try {
        const r = await api.auditoria({ quem: quem.trim() || undefined, acao: acao || undefined, de: diaParaMs(de), ate: diaParaMs(ate, true), antesDe });
        setEventos((atual) => (antesDe && atual ? [...atual, ...r.eventos] : r.eventos));
        setProximo(r.proximo);
      } catch (e) {
        aoFalhar(e);
      } finally {
        setCarregando(false);
      }
    },
    [quem, acao, de, ate, aoFalhar],
  );

  // Filtros novos: espera a pessoa parar de digitar e busca do começo.
  useEffect(() => {
    const t = setTimeout(() => void buscar(), 300);
    return () => clearTimeout(t);
  }, [buscar]);

  return (
    <section className="cartao">
      <h2>Auditoria</h2>
      <p className="legenda">
        Quem fez o quê. Guarda só quem, quando, a ação e o IP: nunca senhas, tokens ou o texto das issues. Os registros seguem a mesma retenção do
        histórico.
      </p>
      <div className="busca" role="search">
        <label className="busca-texto">
          Pessoa
          <input value={quem} onChange={(e) => setQuem(e.target.value)} placeholder="E-mail ou parte dele" />
        </label>
        <label>
          Ação
          <select value={acao} onChange={(e) => setAcao(e.target.value as AcaoAuditoria | "")}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_ACAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
      </div>

      {eventos === null ? (
        <p className="legenda">Carregando…</p>
      ) : eventos.length === 0 ? (
        <p className="legenda">Nenhum registro com esses filtros.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Ação</th>
                <th>Sobre</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id} className={e.acao === "login_falhou" ? "evento-alerta" : undefined}>
                  <td>{dataHora(e.quando)}</td>
                  <td>{e.quem}</td>
                  <td>{ROTULO_ACAO[e.acao] ?? e.acao}</td>
                  <td className="secundaria">{[alvo(e), descreverDetalhe(e)].filter(Boolean).join(" · ")}</td>
                  <td className="secundaria">{e.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {proximo !== null && (
        <div className="acoes">
          <button type="button" className="secundario" onClick={() => buscar(proximo)} disabled={carregando}>
            {carregando ? "Carregando…" : "Carregar mais"}
          </button>
        </div>
      )}
    </section>
  );
}
