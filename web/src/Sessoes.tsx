import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, ErroApi, type SessaoAberta } from "./api";
import { useDialogo } from "./Dialogo";
import { dataHora } from "./Historico";
import { SecaoChavesAcesso } from "./ChavesAcesso";
import { SecaoMfa } from "./Mfa";
import { MeuContexto } from "./MeuContexto";

export type AbaConta = "contexto" | "seguranca" | "sessoes";
const ABAS: { id: AbaConta; rotulo: string }[] = [
  { id: "contexto", rotulo: "Meu contexto" },
  { id: "seguranca", rotulo: "Segurança" },
  { id: "sessoes", rotulo: "Sessões" },
];

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
 * Diálogo "Minha conta", em abas: Meu contexto, Segurança (verificação em duas etapas e chaves de
 * acesso) e Sessões (encerrar uma e "Sair de todos os dispositivos"). Encerrar a sessão deste
 * dispositivo leva de volta ao login (`aoSair`).
 */
export function Sessoes({
  conta,
  abaInicial = "contexto",
  aoFechar,
  aoSair,
  aoSalvarContexto,
}: {
  conta: string;
  abaInicial?: AbaConta;
  aoFechar: () => void;
  aoSair: () => void;
  aoSalvarContexto?: () => void;
}) {
  const id = useId();
  const [aba, setAba] = useState<AbaConta>(abaInicial);
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
      <div className="dialogo-corpo">
        <h2 id={`${id}-titulo`}>Minha conta</h2>
        <div className="abas abas-dialogo" role="tablist" aria-label="Minha conta">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`${id}-aba-${a.id}`}
              aria-selected={aba === a.id}
              aria-controls={`${id}-painel`}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${id}-painel`} aria-labelledby={`${id}-aba-${aba}`}>
          {aba === "contexto" && <MeuContexto aoSair={aoSair} aoSalvar={aoSalvarContexto} />}
          {aba === "seguranca" && (
            <>
              <section aria-labelledby={`${id}-mfa`} className="secao-seguranca">
                <h3 id={`${id}-mfa`}>Verificação em duas etapas</h3>
                <SecaoMfa conta={conta} aoSair={aoSair} />
              </section>
              <section aria-labelledby={`${id}-chaves`} className="secao-seguranca">
                <h3 id={`${id}-chaves`}>Chaves de acesso</h3>
                <SecaoChavesAcesso aoSair={aoSair} />
              </section>
            </>
          )}
          {aba === "sessoes" && (
            <>
              <h3 id={`${id}-sessoes`}>Sessões abertas</h3>
              <p className="dialogo-mensagem">Onde a sua conta está conectada. Encerre o que você não reconhece.</p>
              {erro && (
                <p className="erro-campo" role="alert">
                  {erro}
                </p>
              )}
              {sessoes === null && !erro && <p aria-live="polite">Carregando…</p>}
              {sessoes && (
                <ul className="lista-sessoes" aria-labelledby={`${id}-sessoes`}>
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
            </>
          )}
        </div>
        <div className="acoes dialogo-acoes">
          <button type="button" className="secundario" onClick={aoFechar}>
            Fechar
          </button>
          {aba === "sessoes" && (
            <button type="button" className="perigo" disabled={ocupado || !sessoes} onClick={sairDeTodos}>
              Sair de todos os dispositivos
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
