import type { ImagemAnexa } from "../ia/imagens.js";
import { z } from "zod";
import { verificarCoerencia, type Aviso } from "../issue/coerencia.js";
import { montarMarkdown } from "../issue/markdown.js";
import { validarIssue, type Issue } from "../issue/schema.js";
import { ErroGeracao } from "../ia/erros.js";
import { extrairJson, secaoAtual } from "../ia/json.js";
import type { NomeProvedor, Provedor, Uso } from "../ia/tipos.js";
import type { Idioma } from "../prompt/entrada.js";
import { promptSistema } from "../prompt/montar.js";

export type EventoProgresso = {
  fase: "analisando" | "escrevendo";
  /** Caracteres de JSON recebidos até agora. */
  caracteres: number;
  /** Seção que a IA está escrevendo (ex.: "Casos de teste"). */
  secao: string | null;
};

export type ResultadoGeracao = {
  issue: Issue;
  markdown: string;
  avisos: Aviso[];
  uso: Uso;
  provedor: NomeProvedor;
  modelo: string;
  usouFallback: boolean;
  duracaoMs: number;
};

const INTERVALO_PROGRESSO_MS = 250;

/**
 * Pede a issue ao provedor e transforma o texto em resultado validado. Toda a lógica que não
 * depende do provedor fica aqui: progresso, JSON, schema, Markdown e avisos de coerência.
 */
export async function gerarIssue(
  provedor: Provedor,
  usuario: string,
  opcoes: { signal: AbortSignal; aoProgresso: (e: EventoProgresso) => void; sistema?: string; idioma?: Idioma; imagens?: ImagemAnexa[] },
): Promise<ResultadoGeracao> {
  const inicio = Date.now();
  let parcial = "";
  let ultimoEnvio = 0;
  // Avisa já no início, sem esperar o provedor: alguns modelos raciocinam por muitos segundos
  // antes do primeiro trecho, e a tela precisa mostrar algo em até 5 s.
  let analisandoAvisado = true;
  opcoes.aoProgresso({ fase: "analisando", caracteres: 0, secao: null });

  const resposta = await provedor.gerar(
    { sistema: opcoes.sistema ?? promptSistema(), usuario, imagens: opcoes.imagens },
    {
      signal: opcoes.signal,
      aoProgresso: (p) => {
        if (p.fase === "analisando") {
          if (!analisandoAvisado) {
            analisandoAvisado = true;
            opcoes.aoProgresso({ fase: "analisando", caracteres: 0, secao: null });
          }
          return;
        }
        parcial += p.delta;
        const agora = Date.now();
        if (agora - ultimoEnvio >= INTERVALO_PROGRESSO_MS) {
          ultimoEnvio = agora;
          opcoes.aoProgresso({ fase: "escrevendo", caracteres: parcial.length, secao: secaoAtual(parcial) });
        }
      },
    },
  );

  let dado: unknown;
  try {
    dado = extrairJson(resposta.texto);
  } catch (e) {
    throw new ErroGeracao("json_invalido", `JSON não interpretável: ${(e as Error).message}`);
  }
  const validacao = validarIssue(dado);
  if (!validacao.success) {
    throw new ErroGeracao("json_invalido", z.prettifyError(validacao.error));
  }

  const issue = validacao.data;
  return {
    issue,
    markdown: montarMarkdown(issue, opcoes.idioma),
    avisos: verificarCoerencia(issue),
    uso: resposta.uso,
    provedor: provedor.nome,
    modelo: resposta.modelo,
    usouFallback: resposta.usouFallback,
    duracaoMs: Date.now() - inicio,
  };
}
