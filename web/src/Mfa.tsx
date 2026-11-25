import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ErroApi, type EstadoMfa } from "./api";
import { comConfirmacaoDeSenha } from "./confirmarSenha";
import { useDialogo } from "./Dialogo";

/** Texto do arquivo de códigos de recuperação para baixar. */
export function textoDosCodigos(codigos: string[], conta: string): string {
  return [
    "Issue Doc Generator: códigos de recuperação",
    `Conta: ${conta}`,
    "Cada código vale uma vez, no lugar do código do aplicativo.",
    "",
    ...codigos,
    "",
  ].join("\n");
}

function CodigosDeRecuperacao({ codigos, conta, aoTerminar }: { codigos: string[]; conta: string; aoTerminar: () => void }) {
  function baixar() {
    const url = URL.createObjectURL(new Blob([textoDosCodigos(codigos, conta)], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "codigos-de-recuperacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="mfa-codigos">
      <p>
        <strong>Guarde estes códigos de recuperação.</strong> Cada um entra uma vez, se você perder o celular. Eles não aparecem de novo.
      </p>
      <ul aria-label="Códigos de recuperação">
        {codigos.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <div className="acoes">
        <button type="button" className="secundario" onClick={baixar}>
          Baixar .txt
        </button>
        <button type="button" onClick={aoTerminar}>
          Já guardei
        </button>
      </div>
    </div>
  );
}

/**
 * Verificação em duas etapas (aplicativo autenticador). Liga com QR code e um código, mostra os
 * códigos de recuperação uma vez, gera novos e desliga (essas duas pedem a senha de novo).
 */
export function SecaoMfa({ conta, aoLigar, aoSair }: { conta: string; aoLigar?: () => void; aoSair: () => void }) {
  const dialogo = useDialogo();
  const [estado, setEstado] = useState<EstadoMfa | null>(null);
  const [config, setConfig] = useState<{ segredo: string; qr: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const falhou = useCallback(
    (e: unknown) => {
      if (e instanceof ErroApi && e.status === 401) return aoSair();
      setErro(e instanceof ErroApi ? e.message : "Não foi possível concluir. Tente de novo.");
    },
    [aoSair],
  );

  const carregar = useCallback(() => {
    api.mfa().then(setEstado).catch(falhou);
  }, [falhou]);

  useEffect(carregar, [carregar]);

  async function rodar(acao: () => Promise<void>) {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
    } catch (e) {
      falhou(e);
    } finally {
      setOcupado(false);
    }
  }

  const iniciar = () => rodar(async () => setConfig(await api.iniciarMfa()));

  const ativar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void rodar(async () => {
      const r = await api.ativarMfa(codigo.replace(/\s/g, ""));
      setConfig(null);
      setCodigo("");
      setCodigos(r.codigos);
      carregar();
    });
  };

  const novosCodigos = () =>
    rodar(async () => {
      const r = await comConfirmacaoDeSenha(dialogo, () => api.novosCodigosMfa());
      if (r) setCodigos(r.codigos);
      carregar();
    });

  const desligar = () =>
    rodar(async () => {
      const ok = await dialogo.confirmar({
        titulo: "Desligar a verificação em duas etapas?",
        mensagem: "A conta volta a entrar só com a senha.",
        acao: "Desligar",
        perigo: true,
      });
      if (!ok) return;
      await comConfirmacaoDeSenha(dialogo, () => api.desativarMfa());
      carregar();
    });

  if (codigos) {
    return (
      <CodigosDeRecuperacao
        codigos={codigos}
        conta={conta}
        aoTerminar={() => {
          setCodigos(null);
          aoLigar?.();
        }}
      />
    );
  }

  if (!estado) return <p aria-live="polite">Carregando…</p>;

  return (
    <div className="mfa">
      {erro && (
        <p className="erro-campo" role="alert">
          {erro}
        </p>
      )}
      {estado.ativo ? (
        <>
          <p>
            <span className="selo">ligada</span> Ao entrar, além da senha, o sistema pede o código do aplicativo autenticador.{" "}
            {estado.codigosRestantes} código(s) de recuperação sobrando.
          </p>
          <div className="acoes">
            <button type="button" className="secundario" disabled={ocupado} onClick={novosCodigos}>
              Gerar novos códigos de recuperação
            </button>
            {!estado.exigido && (
              <button type="button" className="secundario" disabled={ocupado} onClick={desligar}>
                Desligar
              </button>
            )}
          </div>
        </>
      ) : config ? (
        <form onSubmit={ativar} className="mfa-configurar">
          <p>1. No aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…), leia o QR code.</p>
          <img src={config.qr} alt="QR code para o aplicativo autenticador" width={180} height={180} />
          <p className="legenda">
            Sem câmera? Digite a chave: <code className="mfa-segredo">{config.segredo}</code>
          </p>
          <label>
            2. Digite o código de 6 dígitos que o aplicativo mostra
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
          </label>
          <div className="acoes">
            <button type="submit" disabled={ocupado}>
              Ligar
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>
            {estado.exigido
              ? "Para administradores, a verificação em duas etapas é obrigatória."
              : "Desligada. Ligue para pedir, além da senha, um código do aplicativo autenticador do celular."}
          </p>
          <div className="acoes">
            <button type="button" disabled={ocupado} onClick={iniciar}>
              Ligar a verificação em duas etapas
            </button>
          </div>
        </>
      )}
    </div>
  );
}
