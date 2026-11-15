import { z } from "zod";

// Formato que a IA devolve. Todos os campos são obrigatórios (listas podem vir vazias) e não há
// restrições numéricas nem de tamanho: é o subconjunto de JSON Schema aceito ao mesmo tempo pela
// Claude (output_config.format), pela OpenAI (strict) e pelo Gemini (responseSchema).

export const TIPOS_ISSUE = ["Correção", "Nova funcionalidade", "Ajuste técnico", "Melhoria"] as const;
export const TIPOS_CASO = ["feliz", "alternativo", "negativo", "limite", "nao_funcional"] as const;

export const EstadoSchema = z.object({
  status: z.string(),
  significado: z.string(),
  vai_para: z.array(z.string()),
  quem_muda: z.string(),
});

export const RegraSchema = z.object({
  id: z.string().describe('Identificador da regra, ex.: "RN1".'),
  regra: z.string().describe("Condição → resultado."),
  exemplo: z.string().describe("Exemplo concreto com dados fictícios."),
});

export const ElementoInterfaceSchema = z.object({
  elemento: z.string(),
  tipo: z.string().describe("Botão, campo de texto, checkbox, tooltip, coluna…"),
  texto_exato: z.string(),
  obrigatorio: z.boolean(),
  regra: z.string().describe("Limite, formato, valor padrão."),
});

export const MensagemSchema = z.object({
  tipo: z.string().describe("Sucesso, erro, aviso, confirmação…"),
  texto: z.string().describe("Texto exato da mensagem."),
});

export const EscopoSchema = z.object({
  telas: z.array(z.string()),
  perfis: z.array(z.string()),
  integracoes: z.array(z.string()),
  limites: z.array(z.string()),
  desempenho: z.string(),
});

export const CriterioSchema = z.object({
  id: z.string().describe('Ex.: "CA1".'),
  texto: z.string(),
  regras_cobertas: z.array(z.string()).describe("IDs das regras que este critério cobre."),
});

export const CasoSchema = z.object({
  id: z.string().describe('Ex.: "CT1".'),
  criterio: z.string().describe("ID do critério de aceite coberto."),
  tipo: z.enum(TIPOS_CASO),
  dado: z.string(),
  quando: z.string(),
  entao: z.string(),
  tecnica: z.string().describe('Técnica com a seção do ISTQB, ex.: "Valor limite (4.2.2)".'),
  item_cobertura: z.string(),
});

export const RevisaoSchema = z.object({
  checklist: z.array(z.object({ item: z.string(), ok: z.boolean() })),
  duvidas: z.array(
    z.object({
      trecho: z.string().describe("Trecho da entrada ou da issue que gerou a dúvida."),
      pergunta: z.string(),
    }),
  ),
});

export const IssueSchema = z.object({
  titulo: z.string(),
  tipo: z.enum(TIPOS_ISSUE),
  produto: z.string(),
  modulo: z.string(),
  perfis: z.array(z.string()),
  prioridade: z.string(),
  problema: z.string(),
  solucao: z.string(),
  contexto: z.string(),
  estados: z.array(EstadoSchema),
  regras: z.array(RegraSchema),
  fluxo_decisao: z.string().describe("Fluxo de decisão em texto/ASCII; vazio se não houver se/senão."),
  interface: z.array(ElementoInterfaceSchema),
  mensagens: z.array(MensagemSchema),
  escopo: EscopoSchema,
  fora_de_escopo: z.array(z.string()),
  criterios: z.array(CriterioSchema),
  casos: z.array(CasoSchema),
  revisao: RevisaoSchema,
});

export type Issue = z.infer<typeof IssueSchema>;
export type Caso = z.infer<typeof CasoSchema>;
export type TipoCaso = (typeof TIPOS_CASO)[number];

/** Valida um objeto qualquer (ex.: JSON vindo de um provedor) contra o schema da issue. */
export function validarIssue(dado: unknown) {
  return IssueSchema.safeParse(dado);
}

/** JSON Schema do formato, para provedores que recebem o schema cru (OpenAI, Gemini). */
export function issueJsonSchema() {
  return z.toJSONSchema(IssueSchema, { target: "draft-7" });
}
