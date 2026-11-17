import { lazy, Suspense, useEffect, useState } from "react";
import { api, rotuloStatus, type IssuePublica } from "./api";
import { dataHora } from "./Historico";

const Markdown = lazy(() => import("./Markdown").then((m) => ({ default: m.Markdown })));

/** Leitura de uma issue por link de compartilhamento: sem login, sem ações, só o texto. */
export function Compartilhado({ token }: { token: string }) {
  const [issue, setIssue] = useState<IssuePublica | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .publico(token)
      .then((r) => {
        setIssue(r.issue);
        document.title = `${r.issue.titulo} · Issue Doc Generator`;
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível abrir este link."));
  }, [token]);

  if (erro) {
    return (
      <section className="cartao" role="alert">
        <h2>Link indisponível</h2>
        <p>{erro}</p>
        <p className="legenda">Peça um link novo a quem compartilhou a issue.</p>
      </section>
    );
  }
  if (!issue) return <p className="carregando">Carregando…</p>;

  return (
    <section className="cartao resultado">
      <p className="legenda compartilhado-meta">
        Issue compartilhada só para leitura · {issue.produto} · {issue.tipo} · {rotuloStatus(issue.status)} · versão {issue.versoes} · por{" "}
        {issue.autor} · atualizada em {dataHora(issue.atualizadaEm)}
      </p>
      <Suspense fallback={<p className="carregando">Carregando…</p>}>
        <Markdown fonte={issue.markdown} />
      </Suspense>
    </section>
  );
}
