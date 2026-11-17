import { z } from "zod";
import { Limitador } from "../auth/limite.js";
import { ErroValidacao } from "../banco/banco.js";
import type { Alteracao, RepositorioConfiguracao } from "../banco/configuracao.js";
import type { Config } from "../config.js";
import { comReserva } from "../ia/reserva.js";
import type { NomeProvedor, Provedor } from "../ia/tipos.js";

/** O que a tela de administração muda. O resto (chaves, porta, segredo) fica no .env. */
export const EsquemaAjustes = z.object({
  provedor: z.enum(["anthropic", "openai", "openai_compativel", "gemini"], { error: "Escolha um provedor válido." }),
  modelo: z.string().trim().max(200, "O nome do modelo pode ter até 200 caracteres."),
  modeloReserva: z.string().trim().max(200, "O nome do modelo reserva pode ter até 200 caracteres."),
  esforco: z.enum(["low", "medium", "high", "xhigh", "max"], { error: "Escolha um esforço válido." }),
  limitePorHora: z.coerce
    .number({ error: "Informe um número." })
    .int("Use um número inteiro.")
    .min(1, "O limite por hora vai de 1 a 1.000.")
    .max(1000, "O limite por hora vai de 1 a 1.000."),
  tempoLimiteSegundos: z.coerce
    .number({ error: "Informe um número." })
    .int("Use um número inteiro.")
    .min(30, "O tempo limite vai de 30 a 1.800 segundos.")
    .max(1800, "O tempo limite vai de 30 a 1.800 segundos."),
  retencaoDias: z.coerce
    .number({ error: "Informe um número." })
    .int("Use um número inteiro.")
    .min(1, "A retenção vai de 1 a 3.650 dias.")
    .max(3650, "A retenção vai de 1 a 3.650 dias."),
  backupCopias: z.coerce
    .number({ error: "Informe um número." })
    .int("Use um número inteiro.")
    .min(1, "Guarde de 1 a 90 backups.")
    .max(90, "Guarde de 1 a 90 backups."),
});

export type ValoresAjustes = z.infer<typeof EsquemaAjustes>;
type Chave = keyof ValoresAjustes;

export const MODELO_PADRAO: Partial<Record<NomeProvedor, string>> = { anthropic: "claude-opus-5-5" };
export const RETENCAO_PADRAO_DIAS = 180;
export const BACKUP_PADRAO_COPIAS = 7;

const ROTULOS: Record<NomeProvedor, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  openai_compativel: "Compatível com OpenAI",
  gemini: "Gemini (Google)",
};

export type InfoProvedor = { nome: NomeProvedor; rotulo: string; disponivel: boolean; motivo: string | null; modeloPadrao: string };

/**
 * Configuração da IA em uso: valores do .env como ponto de partida, sobrescritos pelo que foi
 * salvo na tela de administração (SQLite). Troca de provedor ou modelo vale na próxima geração,
 * sem reiniciar o servidor.
 */
export class Ajustes {
  readonly limiteUso: Limitador;
  private atuais: ValoresAjustes;
  private provedorAtual: Provedor | null = null;

  constructor(
    private readonly base: Config,
    private readonly repo: RepositorioConfiguracao,
    private readonly fabrica: (c: Config) => Provedor | null,
    private readonly aviso: (mensagem: string) => void = () => {},
  ) {
    const doEnv: ValoresAjustes = {
      provedor: base.provedor,
      modelo: base.modelo,
      modeloReserva: "",
      esforco: base.esforco,
      limitePorHora: base.limitePorHora,
      tempoLimiteSegundos: Math.round(base.tempoLimiteMs / 1000),
      retencaoDias: RETENCAO_PADRAO_DIAS,
      backupCopias: BACKUP_PADRAO_COPIAS,
    };
    // Valor salvo inválido (ex.: provedor cuja chave saiu do .env) é ignorado, com aviso no log.
    const salvos = repo.ler();
    const valores = { ...doEnv };
    for (const chave of Object.keys(EsquemaAjustes.shape) as Chave[]) {
      if (!(chave in salvos)) continue;
      const r = EsquemaAjustes.shape[chave].safeParse(salvos[chave]);
      if (r.success) (valores as Record<Chave, unknown>)[chave] = r.data;
    }
    if (!this.disponibilidade(valores.provedor).disponivel) {
      this.aviso(`Provedor salvo "${valores.provedor}" sem chave no .env: usando "${doEnv.provedor}".`);
      valores.provedor = doEnv.provedor;
      valores.modelo = doEnv.modelo;
      valores.modeloReserva = "";
    }
    this.atuais = valores;
    this.limiteUso = new Limitador(valores.limitePorHora, 3_600_000);
    this.reconstruir();
  }

  valores(): ValoresAjustes {
    return { ...this.atuais };
  }

  /** Config completa em uso: o .env com os valores da administração por cima. */
  config(): Config {
    const v = this.atuais;
    return {
      ...this.base,
      provedor: v.provedor,
      modelo: v.modelo || MODELO_PADRAO[v.provedor] || "",
      esforco: v.esforco,
      limitePorHora: v.limitePorHora,
      tempoLimiteMs: v.tempoLimiteSegundos * 1000,
    };
  }

  provedor(): Provedor | null {
    return this.provedorAtual;
  }

  provedores(): InfoProvedor[] {
    return (Object.keys(ROTULOS) as NomeProvedor[]).map((nome) => ({
      nome,
      rotulo: ROTULOS[nome],
      ...this.disponibilidade(nome),
      modeloPadrao: MODELO_PADRAO[nome] ?? "",
    }));
  }

  alteracoes(limite = 30): Alteracao[] {
    return this.repo.alteracoes(limite);
  }

  /** Valida, grava no banco e passa a usar. Lança ErroValidacao com mensagem para a tela. */
  salvar(mudancas: unknown, quem: string): ValoresAjustes {
    const parcial = EsquemaAjustes.partial().safeParse(mudancas);
    if (!parcial.success) throw new ErroValidacao(parcial.error.issues[0]?.message ?? "Valores inválidos.");
    const novos: ValoresAjustes = { ...this.atuais, ...parcial.data };

    const d = this.disponibilidade(novos.provedor);
    if (!d.disponivel) throw new ErroValidacao(d.motivo ?? "Provedor indisponível.");
    if (!novos.modelo && !MODELO_PADRAO[novos.provedor]) {
      throw new ErroValidacao(`Informe o modelo do provedor ${ROTULOS[novos.provedor]}.`);
    }
    if (novos.modeloReserva && novos.modeloReserva === (novos.modelo || MODELO_PADRAO[novos.provedor])) {
      throw new ErroValidacao("O modelo reserva precisa ser diferente do modelo principal.");
    }

    this.repo.gravar(novos, this.atuais, quem);
    this.atuais = novos;
    this.limiteUso.definirMaximo(novos.limitePorHora);
    this.reconstruir();
    return this.valores();
  }

  private disponibilidade(nome: NomeProvedor): { disponivel: boolean; motivo: string | null } {
    const b = this.base;
    const falta: Record<NomeProvedor, string | null> = {
      anthropic: b.anthropicApiKey ? null : "Sem ANTHROPIC_API_KEY no .env.",
      openai: b.openaiApiKey ? null : "Sem OPENAI_API_KEY no .env.",
      openai_compativel: b.openaiBaseUrl ? null : "Sem OPENAI_BASE_URL no .env.",
      gemini: b.geminiApiKey ? null : "Sem GEMINI_API_KEY no .env.",
    };
    return { disponivel: falta[nome] === null, motivo: falta[nome] };
  }

  private reconstruir() {
    const c = this.config();
    const principal = c.modelo ? this.fabrica(c) : null;
    const reserva = principal && this.atuais.modeloReserva ? this.fabrica({ ...c, modelo: this.atuais.modeloReserva }) : null;
    this.provedorAtual =
      principal && reserva
        ? comReserva(principal, reserva, (motivo) => this.aviso(`Modelo ${c.modelo} indisponível (${motivo}): usando o reserva ${this.atuais.modeloReserva}.`))
        : principal;
  }
}
