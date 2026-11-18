import { z } from "zod";

// Prints ou imagens anexados à descrição. Vão só para o provedor de IA, nesta geração: não ficam no
// histórico nem no log. Os 4 provedores aceitam PNG, JPEG, WebP e GIF.

export const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type TipoImagem = (typeof TIPOS_IMAGEM)[number];
export type ImagemAnexa = { tipo: TipoImagem; dados: string };

export const MAX_IMAGENS = 3;
/** Por imagem, depois de decodificada. A tela reduz prints grandes antes de enviar. */
export const MAX_BYTES_IMAGEM = 4 * 1024 * 1024;
/** Teto do corpo do pedido com imagens (3 × 4 MB em base64, com folga). */
export const LIMITE_CORPO_COM_IMAGENS = 18 * 1024 * 1024;

// Assinatura do começo de cada formato: confere que o conteúdo é mesmo do tipo declarado.
const ASSINATURAS: Record<TipoImagem, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  "image/gif": (b) => ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")),
};

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const semPrefixo = (dados: string) => dados.replace(/^data:[^;,]+;base64,/, "");

const ImagemSchema = z
  .object({ tipo: z.enum(TIPOS_IMAGEM, { error: "Imagem em formato não aceito: use PNG, JPEG, WebP ou GIF." }), dados: z.string() })
  .superRefine((img, ctx) => {
    const dados = semPrefixo(img.dados);
    if (!BASE64.test(dados) || dados.length % 4 !== 0) {
      ctx.addIssue({ code: "custom", message: "Imagem inválida." });
      return;
    }
    const bytes = Buffer.from(dados, "base64");
    if (bytes.length > MAX_BYTES_IMAGEM) {
      ctx.addIssue({ code: "custom", message: "Cada imagem pode ter até 4 MB." });
    } else if (!ASSINATURAS[img.tipo](bytes)) {
      ctx.addIssue({ code: "custom", message: "O conteúdo da imagem não confere com o formato informado." });
    }
  })
  .transform((img): ImagemAnexa => ({ tipo: img.tipo, dados: semPrefixo(img.dados) }));

export const ImagensSchema = z.array(ImagemSchema).max(MAX_IMAGENS, `Anexe até ${MAX_IMAGENS} imagens.`).default([]);
