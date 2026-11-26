import { useCallback, useEffect, useState } from "react";
import { api, ErroApi, type MeuContexto as Contexto } from "./api";
import { useDialogo } from "./Dialogo";

/**
 * "Meu contexto": a pessoa descreve o sistema dela; a IA gera uma versão compacta, que ela revisa
 * antes de salvar. Só a compacta vai nas gerações.
 */
export function MeuContexto({ aoSair, aoSalvar }: { aoSair: () => void; aoSalvar?: () => void }) {
  const dialogo = useDialogo();
  const [salvo, setSalvo] = useState<Contexto | null>(null);
  const [limites, setLimites] = useState({ original: 8000, compacto: 2000 });
  const [original, setOriginal] = useState("");
  const [compacto, setCompacto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    api
      .contexto()
      .then((c) => {
        setSalvo(c);
        setLimites(c.limites);
        setOriginal(c.original);
        setCompacto(c.compacto);
      })
      .catch((e) => (e instanceof ErroApi && e.status === 401 ? aoSair() : setErro("Não foi possível carregar o seu contexto.")));
  }, [aoSair]);
  useEffect(carregar, [carregar]);

  async function rodar(acao: () => Promise<void>) {
    setOcupado(true);
    setErro(null);
    setInfo(null);
    try {
      await acao();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível concluir. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  const compactar = () => rodar(async () => setCompacto((await api.compactarContexto(original)).compacto));
  const salvar = () =>
    rodar(async () => {
      setSalvo(await api.salvarContexto(original, compacto));
      setInfo("Contexto salvo. Ele vale para as próximas issues.");
      aoSalvar?.();
    });
  async function apagar() {
    const ok = await dialogo.confirmar({ titulo: "Apagar o seu contexto?", mensagem: "As próximas issues saem sem ele.", acao: "Apagar", perigo: true });
    if (!ok) return;
    await rodar(async () => {
      await api.apagarContexto();
      setOriginal("");
      setCompacto("");
      setSalvo((s) => s && { ...s, original: "", compacto: "" });
      setInfo("Contexto apagado.");
    });
  }

  if (!salvo) return erro ? <p className="erro-campo">{erro}</p> : <p aria-live="polite">Carregando…</p>;
  const mudou = original.trim() !== salvo.original || compacto.trim() !== salvo.compacto;

  return (
    <div className="mfa">
      <p>Conte sobre o sistema em que você trabalha: produto, módulos, termos, perfis, regras. Vale para todas as suas issues. Não coloque dados pessoais.</p>
      <label className="campo">
        Sobre o seu sistema
        <textarea rows={6} maxLength={limites.original} value={original} onChange={(e) => setOriginal(e.target.value)} />
      </label>
      <div className="acoes">
        <button type="button" className="secundario" disabled={ocupado || !original.trim()} onClick={compactar}>
          {ocupado ? "Aguarde…" : "Gerar versão compacta"}
        </button>
      </div>
      {(compacto || salvo.compacto) && (
        <label className="campo">
          Versão compacta (é ela que vai para a IA; revise antes de salvar)
          <textarea rows={6} maxLength={limites.compacto} value={compacto} onChange={(e) => setCompacto(e.target.value)} />
        </label>
      )}
      {erro && (
        <p className="erro-campo" role="alert">
          {erro}
        </p>
      )}
      {info && <p aria-live="polite">{info}</p>}
      <div className="acoes">
        <button type="button" disabled={ocupado || !compacto.trim() || !mudou} onClick={salvar}>
          Salvar
        </button>
        {salvo.compacto && (
          <button type="button" className="secundario" disabled={ocupado} onClick={apagar}>
            Apagar
          </button>
        )}
      </div>
    </div>
  );
}
