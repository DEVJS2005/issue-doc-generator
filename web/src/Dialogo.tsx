import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useValidacao } from "./Formulario";

type OpcoesConfirmar = {
  titulo: string;
  mensagem?: ReactNode;
  /** Texto do botão principal, por exemplo "Apagar". */
  acao: string;
  /** Ação destrutiva: botão vermelho e foco inicial em Cancelar. */
  perigo?: boolean;
};

type OpcoesTexto = {
  titulo: string;
  mensagem?: ReactNode;
  rotulo: string;
  acao: string;
  valor?: string;
  senha?: boolean;
  minimo?: number;
  padrao?: string;
  erroPadrao?: string;
  placeholder?: string;
  normalizar?: (v: string) => string;
};

type Pedido =
  | ({ tipo: "confirmar"; responder: (v: boolean) => void } & OpcoesConfirmar)
  | ({ tipo: "texto"; responder: (v: string | null) => void } & OpcoesTexto);

type Dialogos = {
  confirmar: (o: OpcoesConfirmar) => Promise<boolean>;
  pedirTexto: (o: OpcoesTexto) => Promise<string | null>;
};

const Contexto = createContext<Dialogos | null>(null);

export function useDialogo() {
  const d = useContext(Contexto);
  if (!d) throw new Error("useDialogo fora do ProvedorDialogo");
  return d;
}

/** Diálogos do próprio sistema, no lugar de window.confirm e window.prompt. */
export function ProvedorDialogo({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const atual = useRef<Pedido | null>(null);
  const sequencia = useRef(0);
  const [chave, setChave] = useState(0);

  const abrir = useCallback((p: Pedido) => {
    // Um diálogo por vez: um pedido novo cancela o anterior.
    const anterior = atual.current;
    if (anterior?.tipo === "confirmar") anterior.responder(false);
    else anterior?.responder(null);
    atual.current = p;
    setChave(++sequencia.current);
    setPedido(p);
  }, []);

  const responder = useCallback((valor: boolean | string | null) => {
    const p = atual.current;
    atual.current = null;
    setPedido(null);
    if (p) (p.responder as (v: boolean | string | null) => void)(valor);
  }, []);

  const valor = useMemo<Dialogos>(
    () => ({
      confirmar: (o) => new Promise((ok) => abrir({ ...o, tipo: "confirmar", responder: ok })),
      pedirTexto: (o) => new Promise((ok) => abrir({ ...o, tipo: "texto", responder: ok })),
    }),
    [abrir],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      {pedido && <Caixa key={chave} pedido={pedido} aoResponder={responder} />}
    </Contexto.Provider>
  );
}

function Caixa({ pedido, aoResponder }: { pedido: Pedido; aoResponder: (v: boolean | string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [texto, setTexto] = useState(pedido.tipo === "texto" ? (pedido.valor ?? "") : "");
  const v = useValidacao();
  const cancelar = () => aoResponder(pedido.tipo === "confirmar" ? false : null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const inicial = d.querySelector<HTMLElement>("[data-foco]");
    if (inicial) {
      inicial.focus();
      if (inicial instanceof HTMLInputElement) inicial.select();
    }
    return () => d.close();
  }, []);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pedido.tipo === "confirmar") return aoResponder(true);
    if (!v.validar(e.currentTarget)) return;
    aoResponder(pedido.normalizar ? pedido.normalizar(texto) : texto);
  }

  return (
    <dialog
      ref={ref}
      className="dialogo"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={pedido.mensagem ? `${id}-mensagem` : undefined}
      onCancel={(e) => {
        e.preventDefault();
        cancelar();
      }}
      onMouseDown={(e) => {
        // Clique no fundo escurecido fecha (o form ocupa todo o interior da caixa).
        if (e.target === e.currentTarget) cancelar();
      }}
    >
      <form noValidate onSubmit={enviar}>
        <h2 id={`${id}-titulo`}>{pedido.titulo}</h2>
        {pedido.mensagem && (
          <p className="dialogo-mensagem" id={`${id}-mensagem`}>
            {pedido.mensagem}
          </p>
        )}
        {pedido.tipo === "texto" && (
          <label>
            {pedido.rotulo}
            <input
              {...v.campo("valor")}
              data-foco
              type={pedido.senha ? "password" : "text"}
              autoComplete={pedido.senha ? "new-password" : "off"}
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={pedido.minimo}
              pattern={pedido.padrao}
              data-erro={pedido.erroPadrao}
              placeholder={pedido.placeholder}
              value={texto}
              onChange={(e) => setTexto(pedido.normalizar ? pedido.normalizar(e.target.value) : e.target.value)}
            />
            {v.erro("valor")}
          </label>
        )}
        <div className="acoes dialogo-acoes">
          <button type="button" className="secundario" onClick={cancelar} data-foco={pedido.tipo === "confirmar" && pedido.perigo ? true : undefined}>
            Cancelar
          </button>
          <button type="submit" className={pedido.tipo === "confirmar" && pedido.perigo ? "perigo" : undefined} data-foco={pedido.tipo === "confirmar" && !pedido.perigo ? true : undefined}>
            {pedido.acao}
          </button>
        </div>
      </form>
    </dialog>
  );
}
