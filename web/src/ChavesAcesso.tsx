import { useCallback, useEffect, useState } from "react";
import { api, cancelouChave, ErroApi, navegadorTemChaveAcesso, type ChaveAcesso } from "./api";
import { comConfirmacaoDeSenha } from "./confirmarSenha";
import { useDialogo } from "./Dialogo";
import { dataHora } from "./Historico";

/**
 * Chaves de acesso (passkeys): entrar sem senha, com a biometria ou o PIN do aparelho. Cadastrar e
 * remover pedem a senha confirmada há pouco. Some se o servidor não tiver URL_PUBLICA.
 */
export function SecaoChavesAcesso({ aoSair, aoCadastrar }: { aoSair: () => void; aoCadastrar?: () => void }) {
  const dialogo = useDialogo();
  const [estado, setEstado] = useState<{ disponivel: boolean; chaves: ChaveAcesso[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    api
      .chavesAcesso()
      .then(setEstado)
      .catch((e) => (e instanceof ErroApi && e.status === 401 ? aoSair() : setErro("Não foi possível carregar as chaves de acesso.")));
  }, [aoSair]);
  useEffect(carregar, [carregar]);

  async function rodar(acao: () => Promise<unknown>, falha: string) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await comConfirmacaoDeSenha(dialogo, acao);
      if (r !== null) carregar();
      return r;
    } catch (e) {
      if (!cancelouChave(e)) setErro(e instanceof ErroApi ? e.message : falha);
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function adicionar() {
    const r = await rodar(() => api.cadastrarChave(), "Não foi possível cadastrar a chave de acesso. Tente de novo.");
    if (r) aoCadastrar?.();
  }

  async function remover(c: ChaveAcesso) {
    const ok = await dialogo.confirmar({
      titulo: "Remover a chave de acesso?",
      mensagem: `"${c.nome}" não vai mais entrar na sua conta. Apague também a chave no aparelho, se quiser.`,
      acao: "Remover",
      perigo: true,
    });
    if (ok) await rodar(() => api.removerChave(c.id), "Não foi possível remover a chave de acesso. Tente de novo.");
  }

  if (!estado) return erro ? <p className="erro-campo">{erro}</p> : <p aria-live="polite">Carregando…</p>;
  if (!estado.disponivel) return <p className="legenda">Não configurada neste servidor.</p>;
  const suportada = navegadorTemChaveAcesso();

  return (
    <div className="mfa">
      <p>Entre sem senha, com a digital, o rosto ou o PIN do aparelho. A chave vale também como segunda etapa.</p>
      {erro && (
        <p className="erro-campo" role="alert">
          {erro}
        </p>
      )}
      {estado.chaves.length > 0 && (
        <ul className="lista-sessoes" aria-label="Chaves de acesso">
          {estado.chaves.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.nome}</strong>
                <small>
                  criada {dataHora(c.criadaEm)} · {c.ultimoUso ? `último uso ${dataHora(c.ultimoUso)}` : "ainda não usada"}
                </small>
              </div>
              <button type="button" className="botao-texto" disabled={ocupado} onClick={() => remover(c)}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="acoes">
        {suportada ? (
          <button type="button" className="secundario" disabled={ocupado} onClick={adicionar}>
            Adicionar chave de acesso
          </button>
        ) : (
          <p className="legenda">Este navegador não aceita chave de acesso.</p>
        )}
      </div>
    </div>
  );
}
