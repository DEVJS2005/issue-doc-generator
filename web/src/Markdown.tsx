import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

// Nós HAST mínimos (evita dependência só de tipos).
type No = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: No[];
};

const LACUNA = /\[a preencher[^\]]*\]/g;

function texto(no: No): string {
  return no.type === "text" ? (no.value ?? "") : (no.children ?? []).map(texto).join("");
}

function adicionarClasse(no: No, classe: string) {
  const atual = no.properties?.className;
  const lista = Array.isArray(atual) ? atual : atual ? [String(atual)] : [];
  no.properties = { ...no.properties, className: [...lista, classe] };
}

/** Envolve cada "[a preencher…]" num <mark class="lacuna">, sem mudar o texto. */
function destacarLacunas(no: No) {
  if (!no.children) return;
  const novos: No[] = [];
  for (const filho of no.children) {
    if (filho.type === "text" && filho.value && LACUNA.test(filho.value)) {
      LACUNA.lastIndex = 0;
      let ultimo = 0;
      for (const m of filho.value.matchAll(LACUNA)) {
        if (m.index! > ultimo) novos.push({ type: "text", value: filho.value.slice(ultimo, m.index) });
        novos.push({ type: "element", tagName: "mark", properties: { className: ["lacuna"] }, children: [{ type: "text", value: m[0] }] });
        ultimo = m.index! + m[0].length;
      }
      if (ultimo < filho.value.length) novos.push({ type: "text", value: filho.value.slice(ultimo) });
    } else {
      destacarLacunas(filho);
      novos.push(filho);
    }
  }
  no.children = novos;
}

/** Marca o título "Dúvidas para o PO" e a lista logo depois dele, para o destaque visual. */
function destacarDuvidas(raiz: No) {
  const filhos = raiz.children ?? [];
  for (let i = 0; i < filhos.length; i++) {
    const no = filhos[i];
    if (no.type === "element" && no.tagName === "h3" && texto(no).trim() === "Dúvidas para o PO") {
      adicionarClasse(no, "duvidas-titulo");
      const lista = filhos.slice(i + 1).find((n) => n.type === "element");
      if (lista && (lista.tagName === "ol" || lista.tagName === "p")) adicionarClasse(lista, "duvidas");
    }
  }
}

function rehypeDestaques() {
  return (arvore: No) => {
    destacarLacunas(arvore);
    destacarDuvidas(arvore);
  };
}

/**
 * Renderiza exatamente o Markdown que o servidor montou (o mesmo que vai para Copiar e Baixar).
 * O HTML embutido (<br> nas tabelas) passa por rehype-sanitize; os destaques vêm depois.
 */
export function Markdown({ fonte }: { fonte: string }) {
  return (
    <div className="issue">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeDestaques]}>
        {fonte}
      </ReactMarkdown>
    </div>
  );
}
