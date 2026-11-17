import { useEffect, useState, type ReactNode, type SVGProps } from "react";

// Ícones desenhados para o app: traço de 1,75 px, cantos arredondados, 16 px por padrão.
function Icone({ children, tamanho = 16, ...props }: SVGProps<SVGSVGElement> & { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Marca: uma folha de issue com a marca de conferido. */
export function Logo({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <Icone tamanho={tamanho} strokeWidth={1.6}>
      <path d="M6 3h8.5L19 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="m8.5 14.5 2.2 2.2 4.8-4.8" />
    </Icone>
  );
}

export const IconeSol = () => (
  <Icone>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icone>
);

export const IconeLua = () => (
  <Icone>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </Icone>
);

export const IconeSistema = () => (
  <Icone>
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M8 20h8M12 16v4" />
  </Icone>
);

export const IconeSeta = () => (
  <Icone tamanho={14}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icone>
);

export const IconeAlerta = () => (
  <Icone>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 10v4M12 17h.01" />
  </Icone>
);

/** Marca do GitHub (forma oficial do octocat, preenchida). */
export function IconeGithub() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

type Tema = "claro" | "escuro" | "sistema";
const CHAVE_TEMA = "idg:tema";

function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE_TEMA);
    return t === "claro" || t === "escuro" ? t : "sistema";
  } catch {
    return "sistema";
  }
}

/** Aplica o tema no <html>. "sistema" segue o claro/escuro do sistema operacional. */
export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "sistema") delete raiz.dataset.theme;
  else raiz.dataset.theme = tema === "escuro" ? "dark" : "light";
}

/** Seletor claro / escuro / sistema, lembrado só neste navegador. */
export function SeletorTema() {
  const [tema, setTema] = useState<Tema>(lerTema);

  useEffect(() => {
    aplicarTema(tema);
    try {
      localStorage.setItem(CHAVE_TEMA, tema);
    } catch {
      // sem armazenamento: o tema vale só nesta visita
    }
  }, [tema]);

  const opcoes: { valor: Tema; rotulo: string; icone: ReactNode }[] = [
    { valor: "claro", rotulo: "Tema claro", icone: <IconeSol /> },
    { valor: "escuro", rotulo: "Tema escuro", icone: <IconeLua /> },
    { valor: "sistema", rotulo: "Tema do sistema", icone: <IconeSistema /> },
  ];

  return (
    <div className="tema" role="group" aria-label="Tema">
      {opcoes.map((o) => (
        <button key={o.valor} type="button" aria-pressed={tema === o.valor} title={o.rotulo} aria-label={o.rotulo} onClick={() => setTema(o.valor)}>
          {o.icone}
        </button>
      ))}
    </div>
  );
}

/** Rodapé fixo com o crédito do projeto. */
export function Rodape() {
  return (
    <footer className="rodape">
      <span>Construído por</span>
      <a href="https://github.com/DEVJS2005" target="_blank" rel="noopener noreferrer">
        <IconeGithub />
        JSBATIS
      </a>
    </footer>
  );
}
