import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { IssueSchema } from "../issue/schema.js";
import { ErroGeracao, normalizarErro } from "./erros.js";
import type { Provedor } from "./tipos.js";

type OpcoesAnthropic = {
  apiKey: string;
  modelo: string;
  esforco: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens: number;
  /** Fallback de recusa do lado do servidor (fallbacks: "default"). */
  fallbackRecusa: boolean;
};

// Beta que habilita `fallbacks`: se o classificador de segurança recusar, a própria API refaz o
// pedido num modelo de fallback recomendado, na mesma chamada. Só vale na Claude API direta.
const BETA_FALLBACK = "server-side-fallback-2026-07-01";

export function criarProvedorAnthropic(o: OpcoesAnthropic): Provedor {
  const cliente = new Anthropic({ apiKey: o.apiKey, maxRetries: 2 });
  const formatoIssue = zodOutputFormat(IssueSchema);

  return {
    nome: "anthropic",
    modelo: o.modelo,
    async gerar({ sistema, usuario, imagens = [], contextoSistema, formato = "issue" }, { signal, aoProgresso }) {
      try {
        const stream = cliente.beta.messages.stream(
          {
            model: o.modelo,
            max_tokens: o.maxTokens,
            // Bloco de sistema fixo e com cache: a partir da 2ª chamada vem de cache_read_input_tokens.
            // O "Meu contexto" vem num 2º bloco com cache: o 1º serve a todos, o 2º às gerações da pessoa.
            system: [
              { type: "text", text: sistema, cache_control: { type: "ephemeral" } },
              ...(contextoSistema ? [{ type: "text" as const, text: contextoSistema, cache_control: { type: "ephemeral" as const } }] : []),
            ],
            messages: [
              {
                role: "user",
                content: imagens.length
                  ? [
                      ...imagens.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.tipo, data: i.dados } })),
                      { type: "text" as const, text: usuario },
                    ]
                  : usuario,
              },
            ],
            output_config: formato === "issue" ? { effort: o.esforco, format: formatoIssue } : { effort: o.esforco },
            ...(o.fallbackRecusa ? { betas: [BETA_FALLBACK], fallbacks: "default" as const } : {}),
          },
          { signal },
        );

        for await (const evento of stream) {
          if (evento.type === "content_block_start" && evento.content_block.type === "thinking") {
            aoProgresso({ fase: "analisando" });
          } else if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
            aoProgresso({ fase: "escrevendo", delta: evento.delta.text });
          }
        }

        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") {
          throw new ErroGeracao("recusa", `categoria: ${msg.stop_details?.category ?? "?"}`);
        }
        if (msg.stop_reason === "max_tokens") throw new ErroGeracao("max_tokens");

        // Com fallback no meio da resposta, o texto parcial fica e o modelo de fallback continua:
        // juntar todos os blocos de texto devolve o JSON inteiro.
        const texto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        const usouFallback = (msg.usage.iterations ?? []).some((it) => it.type === "fallback_message");

        return {
          texto,
          modelo: msg.model,
          usouFallback,
          uso: {
            entrada: msg.usage.input_tokens,
            saida: msg.usage.output_tokens,
            cacheLeitura: msg.usage.cache_read_input_tokens ?? 0,
            cacheEscrita: msg.usage.cache_creation_input_tokens ?? 0,
          },
        };
      } catch (erro) {
        throw normalizarErro(erro, signal);
      }
    },
  };
}
