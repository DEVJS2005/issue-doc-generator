import OpenAI from "openai";
import { ErroGeracao, normalizarErro } from "./erros.js";
import { schemaParaProvedor } from "./json.js";
import type { Provedor, Uso } from "./tipos.js";

type OpcoesOpenAI = {
  apiKey: string;
  modelo: string;
  maxTokens: number;
  /** URL base de um servidor compatível (Ollama, LM Studio, OpenRouter, Groq…). Vazio = OpenAI. */
  baseURL?: string;
};

// Usa Chat Completions porque é a API que a OpenAI e os servidores compatíveis têm em comum.
// A saída estruturada vai por response_format json_schema estrito. O cache de prompt da OpenAI é
// automático para prefixos longos: o prompt de sistema fixo vem primeiro de propósito.
export function criarProvedorOpenAI(o: OpcoesOpenAI): Provedor {
  const compativel = Boolean(o.baseURL);
  const cliente = new OpenAI({
    apiKey: o.apiKey || (compativel ? "sem-chave" : undefined),
    baseURL: o.baseURL || undefined,
    maxRetries: 2,
  });
  const schema = schemaParaProvedor();

  return {
    nome: compativel ? "openai_compativel" : "openai",
    modelo: o.modelo,
    async gerar({ sistema, usuario, imagens = [] }, { signal, aoProgresso }) {
      try {
        const stream = await cliente.chat.completions.create(
          {
            model: o.modelo,
            // A OpenAI usa max_completion_tokens; servidores compatíveis costumam entender max_tokens.
            ...(compativel ? { max_tokens: o.maxTokens } : { max_completion_tokens: o.maxTokens }),
            messages: [
              { role: "system", content: sistema },
              {
                role: "user",
                content: imagens.length
                  ? [
                      ...imagens.map((i) => ({ type: "image_url" as const, image_url: { url: `data:${i.tipo};base64,${i.dados}` } })),
                      { type: "text" as const, text: usuario },
                    ]
                  : usuario,
              },
            ],
            response_format: { type: "json_schema", json_schema: { name: "issue", schema, strict: true } },
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal },
        );

        aoProgresso({ fase: "analisando" });
        let texto = "";
        let recusa = "";
        let motivoFim: string | null = null;
        let uso: Uso = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };
        let modelo = o.modelo;

        for await (const pedaco of stream) {
          if (pedaco.model) modelo = pedaco.model;
          const escolha = pedaco.choices[0];
          const delta = escolha?.delta?.content;
          if (delta) {
            texto += delta;
            aoProgresso({ fase: "escrevendo", delta });
          }
          if (escolha?.delta?.refusal) recusa += escolha.delta.refusal;
          if (escolha?.finish_reason) motivoFim = escolha.finish_reason;
          if (pedaco.usage) {
            const cache = pedaco.usage.prompt_tokens_details?.cached_tokens ?? 0;
            uso = {
              entrada: pedaco.usage.prompt_tokens - cache,
              saida: pedaco.usage.completion_tokens,
              cacheLeitura: cache,
              cacheEscrita: 0,
            };
          }
        }

        if (recusa || motivoFim === "content_filter") throw new ErroGeracao("recusa", recusa || "content_filter");
        if (motivoFim === "length") throw new ErroGeracao("max_tokens");
        return { texto, uso, modelo, usouFallback: false };
      } catch (erro) {
        throw normalizarErro(erro, signal);
      }
    },
  };
}
