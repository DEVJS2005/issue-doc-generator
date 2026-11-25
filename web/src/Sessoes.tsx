import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, ErroApi, type SessaoAberta } from "./api";
import { useDialogo } from "./Dialogo";
import { dataHora } from "./Historico";

/** "Chrome no Windows", a partir do user-agent. Sem biblioteca: só os casos comuns. */
export function descreverNavegador(ua: string | null): string {
  if (!ua) return "Navegador desconhecido";
  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const sistema = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (navegador && sistema) return `${navegador} no ${sistema}`;
  return navegador ?? sistema ?? ua.slice(0, 60);
}

/**
 * Sessões abertas de quem está logado, num diálogo: encerrar uma e "Sair de todos os
 * dispositivos". Encerrar a sessão deste dispositivo leva de volta ao login (`aoSair`).
 */
export function Sessoes({ aoFechar, aoSair }: { aoFechar: () => void; aoSair: () => void }) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const dialogo = useDialogo();
  const [sessoes, setSessoes] = useState<SessaoAberta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    setErro(null);
    api
      .sessoes()
      .then((r) => setSessoes(r.sessoes))
      .catch((e) => (e instanceof ErroApi && e.status === 401 ? aoSair() : setErro("Não foi possível carregar as sessões. Tente de novo.")));
  }, [aoSair]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    d.showModal();
    carregar();
    return () => d.close();
  }, [carregar]);

  async function encerrar(s: SessaoAberta) {
    setOcupado(true);
    try {
      const r = await api.encerrarSessao(s.id);
      if (r.atual) return aoSair();
      carregar();
    } catch {
      setErro("Não foi possível encerrar a sessão. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function sairDeTodos() {
    const ok = await dialogo.confirmar({
      titulo: "Sair de todos os dispositivos?",
      mensagem: "Todas as suas sessões serão encerradas, inclusive esta. Você vai precisar entrar de novo.",
      acao: "Sair de todos",
      perigo: true,
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await api.encerrarTodas();
      aoSair();
    } catch {
      setErro("Não foi possível encerrar as sessões. Tente de novo.");
      setOcupado(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialogo dialogo-sessoes"
      aria-labelledby={`${id}-titulo`}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <h2 id={`${id}-titulo`}>Sessões abertas</h2>
        <p className="dialogo-mensagem">Onde a sua conta está conectada. Encerre o que você não reconhece.</p>
        {erro && (
          <p className="erro-campo" role="alert">
            {erro}
          </p>
        )}
        {sessoes === null && !erro && <p aria-live="polite">Carregando…</p>}
        {sessoes && (
          <ul className="lista-sessoes">
            {sessoes.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{descreverNavegador(s.navegador)}</strong>
                  {s.atual && <span className="selo">este dispositivo</span>}
                  <small>
                    {s.ip ?? "IP desconhecido"} · último uso {dataHora(s.ultimoUso)}
                  </small>
                </div>
                <button type="button" className="botao-texto" disabled={ocupado} onClick={() => encerrar(s)}>
                  {s.atual ? "Sair" : "Encerrar"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="acoes dialogo-acoes">
          <button type="button" className="secundario" onClick={aoFechar}>
            Fechar
          </button>
          <button type="button" className="perigo" disabled={ocupado || !sessoes} onClick={sairDeTodos}>
            Sair de todos os dispositivos
          </button>
        </div>
      </form>
    </dialog>
  );
}
