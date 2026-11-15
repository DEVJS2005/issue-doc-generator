import type { Issue } from "../../src/issue/schema.js";

// Issue fictícia usada nos testes: tem status, regra com limite, interface e uma dúvida.
export function issueExemplo(): Issue {
  return {
    titulo: "Limitar cupons por pedido",
    tipo: "Melhoria",
    produto: "Loja Exemplo",
    modulo: "Checkout",
    perfis: ["Cliente"],
    prioridade: "[a preencher]",
    problema: "Hoje o cliente consegue aplicar vários cupons no mesmo pedido.",
    solucao: "O checkout passa a aceitar até 3 cupons por pedido.",
    contexto: "Reduzir descontos acumulados indevidos.",
    estados: [
      { status: "Ativo", significado: "Cupom pode ser usado", vai_para: ["Expirado"], quem_muda: "Sistema" },
      { status: "Expirado", significado: "Cupom fora da validade", vai_para: [], quem_muda: "Sistema" },
    ],
    regras: [{ id: "RN1", regra: "Pedido com 3 cupons → bloqueia o 4º", exemplo: "Pedido #1001 com A, B, C" }],
    fluxo_decisao: "",
    interface: [
      {
        elemento: "Campo cupom",
        tipo: "Campo de texto",
        texto_exato: "Código do cupom",
        obrigatorio: false,
        regra: "Até 20 caracteres | só letras e números",
      },
    ],
    mensagens: [{ tipo: "Erro", texto: "[a preencher]" }],
    escopo: { telas: ["Checkout"], perfis: ["Cliente"], integracoes: [], limites: ["3 cupons por pedido"], desempenho: "" },
    fora_de_escopo: ["Cupons de frete"],
    criterios: [{ id: "CA1", texto: "Com 3 cupons aplicados, o 4º é recusado.", regras_cobertas: ["RN1"] }],
    casos: [
      {
        id: "CT2",
        criterio: "CA1",
        tipo: "limite",
        dado: "pedido com 3 cupons",
        quando: "aplica o 4º",
        entao: "o 4º é recusado",
        tecnica: "Valor limite (4.2.2)",
        item_cobertura: "máximo+1 = 4",
      },
      {
        id: "CT1",
        criterio: "CA1",
        tipo: "feliz",
        dado: "pedido com 2 cupons",
        quando: "aplica o 3º",
        entao: "o 3º é aceito",
        tecnica: "Valor limite (4.2.2)",
        item_cobertura: "máximo = 3",
      },
    ],
    revisao: {
      checklist: [
        { item: "Todas as seções preenchidas", ok: true },
        { item: "Todo comportamento tem mensagem exata", ok: false },
      ],
      duvidas: [{ trecho: "o 4º é recusado", pergunta: "Qual o texto exato da mensagem de erro?" }],
    },
  };
}
