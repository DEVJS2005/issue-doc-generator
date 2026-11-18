import { useRef, useState } from "react";

// Prints anexados à descrição: vão só para a IA, nesta geração. Não ficam no histórico nem no
// rascunho. Prints grandes são reduzidos no navegador antes de enviar (menos tokens, envio rápido).

export type Anexo = { id: number; nome: string; tipo: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; dados: string; previa: string };

export const MAX_ANEXOS = 3;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_LADO = 1600;
const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
let proximoId = 1;

const paraDataUrl = (blob: Blob) =>
  new Promise<string>((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result));
    leitor.onerror = () => falha(leitor.error);
    leitor.readAsDataURL(blob);
  });

/** Reduz para no máximo 1600 px no maior lado. GIF fica como está (pode ser animado). */
async function reduzir(arquivo: File): Promise<Blob> {
  if (arquivo.type === "image/gif" || typeof createImageBitmap !== "function") return arquivo;
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && arquivo.size <= MAX_BYTES) return arquivo;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // PNG continua PNG (prints com texto ficam nítidos); o resto vira JPEG.
  const tipo = arquivo.type === "image/png" ? "image/png" : "image/jpeg";
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? arquivo), tipo, 0.88));
}

/** Lê um arquivo de imagem e devolve o anexo pronto para enviar, ou a mensagem de erro. */
export async function lerAnexo(arquivo: File): Promise<Anexo | string> {
  if (!(TIPOS as readonly string[]).includes(arquivo.type)) return `“${arquivo.name || "imagem"}” não é PNG, JPEG, WebP ou GIF.`;
  const blob = await reduzir(arquivo);
  if (blob.size > MAX_BYTES) return `“${arquivo.name || "imagem"}” passa de 4 MB mesmo depois de reduzida.`;
  const url = await paraDataUrl(blob);
  const tipo = (blob.type || arquivo.type) as Anexo["tipo"];
  return { id: proximoId++, nome: arquivo.name || "print colado", tipo, dados: url.slice(url.indexOf(",") + 1), previa: url };
}

/** Imagens que vieram coladas (Ctrl+V) ou arrastadas. */
export function imagensDe(dados: DataTransfer | null): File[] {
  return dados ? Array.from(dados.files).filter((f) => f.type.startsWith("image/")) : [];
}

export function Anexos({
  anexos,
  aoAdicionar,
  aoRemover,
  desabilitado,
}: {
  anexos: Anexo[];
  aoAdicionar: (arquivos: File[]) => void;
  aoRemover: (id: number) => void;
  desabilitado: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const cheio = anexos.length >= MAX_ANEXOS;
  return (
    <div className="anexos">
      <div className="anexos-barra">
        <button type="button" className="secundario pequeno" onClick={() => entrada.current?.click()} disabled={desabilitado || cheio}>
          Anexar print
        </button>
        <span className="legenda">
          {cheio ? `Limite de ${MAX_ANEXOS} imagens.` : `Ou cole com Ctrl+V na descrição. Até ${MAX_ANEXOS} imagens; vão só para a IA e não ficam no histórico.`}
        </span>
        <input
          ref={entrada}
          type="file"
          accept={TIPOS.join(",")}
          multiple
          hidden
          aria-label="Escolher imagens"
          onChange={(e) => {
            aoAdicionar(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {anexos.length > 0 && (
        <ul className="anexos-lista">
          {anexos.map((a) => (
            <li key={a.id}>
              <img src={a.previa} alt={`Prévia de ${a.nome}`} />
              <button type="button" className="anexos-remover" onClick={() => aoRemover(a.id)} disabled={desabilitado} aria-label={`Remover ${a.nome}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Estado dos anexos com as regras de limite e as mensagens de erro. */
export function useAnexos() {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function adicionar(arquivos: File[]) {
    setErro(null);
    const vagas = MAX_ANEXOS - anexos.length;
    if (arquivos.length > vagas) setErro(`Anexe até ${MAX_ANEXOS} imagens.`);
    const lidos = await Promise.all(arquivos.slice(0, Math.max(vagas, 0)).map(lerAnexo));
    const erros = lidos.filter((l): l is string => typeof l === "string");
    if (erros.length) setErro(erros.join(" "));
    const novos = lidos.filter((l): l is Anexo => typeof l !== "string");
    if (novos.length) setAnexos((atual) => [...atual, ...novos].slice(0, MAX_ANEXOS));
  }

  return {
    anexos,
    erro,
    adicionar,
    remover: (id: number) => setAnexos((atual) => atual.filter((a) => a.id !== id)),
    limpar: () => {
      setAnexos([]);
      setErro(null);
    },
    /** Só o que o servidor precisa. */
    paraEnvio: () => anexos.map(({ tipo, dados }) => ({ tipo, dados })),
  };
}
