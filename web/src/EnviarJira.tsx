import { useEffect, useState } from "react";
import { api, type EnvioJira, type ProjetoJira, type TipoJira } from "./api";
import { dataHora } from "./Historico";

const CHAVE_ESCOLHA = "idg:jira";

function lerEscolha(): { projeto: string; tipoId: string } {
  try {
    return { projeto: "", tipoId: "", ...JSON.parse(localStorage.getItem(CHAVE_ESCOLHA) ?? "{}") };
  } catch {
    return { projeto: "", tipoId: "" };
  }
}

/**
 * Cria a issue no Jira (projeto e tipo escolhidos aqui; credenciais só no servidor). Cada issue do
 * histórico vira uma só no Jira: depois de enviada, mostra o link para lá.
 */
export function EnviarJira({ historicoId, aoFalhar }: { historicoId: number; aoFalhar: (e: unknown) => void }) {
  const [ligado, setLigado] = useState(false);
  const [envio, setEnvio] = useState<EnvioJira | null>(null);
  const [aberto, setAberto] = useState(false);
  const [projetos, setProjetos] = useState<ProjetoJira[] | null>(null);
  const [tipos, setTipos] = useState<TipoJira[] | null>(null);
  const [escolha, setEscolha] = useState(lerEscolha);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .jira()
      .then(async (j) => {
        setLigado(j.ligado);
        if (j.ligado) setEnvio((await api.envioJira(historicoId)).envio);
      })
      .catch(() => setLigado(false));
  }, [historicoId]);

  useEffect(() => {
    if (!aberto || projetos) return;
    api
      .projetosJira()
      .then((r) => setProjetos(r.projetos))
      .catch(aoFalhar);
  }, [aberto, projetos, aoFalhar]);

  useEffect(() => {
    if (!aberto || !escolha.projeto) return;
    setTipos(null);
    api
      .tiposJira(escolha.projeto)
      .then((r) => setTipos(r.tipos))
      .catch(aoFalhar);
  }, [aberto, escolha.projeto, aoFalhar]);

  async function enviar() {
    setEnviando(true);
    try {
      const r = await api.enviarJira(historicoId, escolha.projeto, escolha.tipoId);
      setEnvio(r.envio);
      setAberto(false);
      try {
        localStorage.setItem(CHAVE_ESCOLHA, JSON.stringify(escolha));
      } catch {
        // sem armazenamento: a escolha vale só agora
      }
    } catch (e) {
      aoFalhar(e);
    } finally {
      setEnviando(false);
    }
  }

  if (!ligado) return null;

  if (envio) {
    return (
      <div className="jira">
        <span className="rotulo-campo">Jira</span>
        <p>
          <a href={envio.url} target="_blank" rel="noopener noreferrer">
            {envio.chave} ↗
          </a>
        </p>
        <p className="legenda">
          Criada por {envio.enviadoPor} em {dataHora(envio.enviadoEm)}. Refinamentos depois disso não atualizam o Jira.
        </p>
      </div>
    );
  }

  const tipoValido = tipos?.some((t) => t.id === escolha.tipoId) ?? false;

  return (
    <div className="jira">
      <span className="rotulo-campo">Jira</span>
      {!aberto ? (
        <p>
          <button type="button" className="secundario" onClick={() => setAberto(true)}>
            Criar no Jira
          </button>
        </p>
      ) : (
        <div className="jira-form">
          <label>
            Projeto
            <select value={escolha.projeto} onChange={(e) => setEscolha({ projeto: e.target.value, tipoId: "" })} disabled={!projetos}>
              <option value="">{projetos ? "Escolha o projeto" : "Carregando…"}</option>
              {projetos?.map((p) => (
                <option key={p.chave} value={p.chave}>
                  {p.nome} ({p.chave})
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select value={escolha.tipoId} onChange={(e) => setEscolha({ ...escolha, tipoId: e.target.value })} disabled={!tipos}>
              <option value="">{!escolha.projeto ? "Escolha o projeto antes" : tipos ? "Escolha o tipo" : "Carregando…"}</option>
              {tipos?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
          <div className="linha-acoes">
            <button type="button" onClick={enviar} disabled={enviando || !escolha.projeto || !tipoValido}>
              {enviando ? "Criando…" : "Criar issue no Jira"}
            </button>
            <button type="button" className="botao-texto" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
