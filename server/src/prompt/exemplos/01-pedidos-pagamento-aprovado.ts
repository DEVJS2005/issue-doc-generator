import type { Exemplo } from "../entrada.js";

// Exemplo 1: fluxo de decisão + checkbox com tooltip. Entrada = texto do PO como chegou.

const descricao = `Atualmente, as integrações do tipo Backoffice (Hubs, ERPs e Plataformas como Anymarket, VTEX, Tray, Tiny, Bling, entre outros) enviam/disparam os pedidos assim que são criados no Portal do Seller, enquanto ainda se encontram no status Aguardando Pagamento.

Em hubs como o Anymarket, existe uma cobrança percentual (ex: 0,4%) sobre todo pedido integrado, independentemente de o pagamento ser posteriormente aprovado, cancelado ou devolvido. Além disso, em diversos ERPs e plataformas de e-commerce, a entrada de pedidos não pagos gera retrabalho operacional de cancelamento e reserva indevida de estoque.

A solução consiste em disponibilizar um novo parâmetro genérico (checkbox e tooltip de aviso) na tela de configurações de TODAS as integrações da categoria Backoffice. Esse parâmetro permitirá que o marketplace defina, individualmente por plataforma, se a integração deve aguardar a aprovação do pagamento (Aguardando Faturamento) antes de disparar o pedido para o sistema de destino.`;

const contexto = `Requisito Técnico: Ingestão Condicional de Pedidos por Status Financeiro para Integrações Backoffice (ERP / Hubs)

2. Especificação da Interface (Frontend - Tela de Configurações de Integração)
Na tela de edição das Configurações de Integração (/app/integrations/manageIntegration) para qualquer plataforma configurada na categoria Backoffice (Anymarket, VTEX, Tray, Tiny, Bling, etc.), adicionar o novo parâmetro logo abaixo da seção de credenciais da API:

2.1. Componentes em Tela:
integrate_only_paid_orders (Boolean, Default: false):
Rótulo/Checkbox: [ ] Integrar apenas pedidos com pagamentos aprovados
Tooltip Informativo (Ícone de Ajuda ℹ️ / Hover):
Texto do Tooltip:
"⚠️ Atenção: Ao ativar esta opção, os pedidos só serão enviados a esta integração após a confirmação do pagamento. Isso impacta o tempo de reserva de estoque no seller, pois o lojista deixará de receber os pedidos imediatamente na criação e só os receberá quando o pagamento for aprovado."

3. Regra de Negócio e Engenharia de Processamento (Back-end)
O motor de envio/sincronização de pedidos para integrações do tipo Backoffice aplicará a seguinte regra:

                       [ Novo Pedido Criado no Portal do Seller ]
                                          │
                                          ▼
                      ¿'integrate_only_paid_orders' está ATIVO
                            na integração destino?
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼ [SIM]                                       ▼ [NÃO]
     ¿Status = AGUARDANDO FATURAMENTO?               Envio Imediato no Status:
                   │                                  AGUARDANDO PAGAMENTO
         ┌─────────┴─────────┐                         (Fluxo Atual)
         ▼ [SIM]             ▼ [NÃO]
   [ Envia Pedido ]   [ Retém Envio até
                       Aprovação ]

Cenário A (integrate_only_paid_orders = false - Padrão/Desmarcado):
O sistema mantém o comportamento legado, enviando o pedido para o ERP/Hub assim que é criado no status Aguardando Pagamento.

Cenário B (integrate_only_paid_orders = true - Ativo/Marcado):
O sistema retém a notificação/envio do pedido para a plataforma conectada enquanto o status for Aguardando Pagamento.
O envio do pedido para o ERP/Hub/Plataforma é acionado apenas quando o status do pedido no Portal do Seller avançar para Aguardando Faturamento (Pagamento Aprovado).
Caso o pedido seja cancelado ou expirado antes do pagamento ser confirmado, ele não é enviado para a integração de Backoffice, isentando tarifas operacionais e custos de taxa sobre vendas não concretizadas.

4. Escopo de Integrações Afetadas
A nova configuração deve ser disponibilizada para todas as integrações cadastradas como tipo Backoffice

5. Critérios de Aceite
[ ] O checkbox Integrar apenas pedidos com pagamentos aprovados é adicionado na tela de configurações de todas as integrações da categoria Backoffice.
[ ] O tooltip explicativo sobre o impacto no tempo de reserva de estoque no seller é exibido ao focar/passar o mouse no ícone de ajuda da configuração.
[ ] A mensagem e o parâmetro são visíveis exclusivamente na tela administrativa de gestão de integrações do marketplace.
[ ] Quando o parâmetro estiver desmarcado, pedidos continuam integrando no status Aguardando Pagamento.
[ ] Quando o parâmetro estiver marcado, o sistema integra o pedido na plataforma (Anymarket, VTEX, Tiny, Bling, etc.) estritamente ao atingir o status Aguardando Faturamento.
[ ] Pedidos cancelados ou não pagos antes da aprovação financeira não são transmitidos para a integração configurada.`;

const TOOLTIP =
  "⚠️ Atenção: Ao ativar esta opção, os pedidos só serão enviados a esta integração após a confirmação do pagamento. Isso impacta o tempo de reserva de estoque no seller, pois o lojista deixará de receber os pedidos imediatamente na criação e só os receberá quando o pagamento for aprovado.";

export const exemploPedidosPagamentoAprovado: Exemplo = {
  nome: "Integração apenas de pedidos com pagamento aprovado (Backoffice)",
  entrada: { tipo: "Nova funcionalidade", produto: "Portal do Seller", descricao, contexto },
  saida: {
    titulo: "Integração apenas de pedidos com pagamento aprovado (Backoffice)",
    tipo: "Nova funcionalidade",
    produto: "Portal do Seller",
    modulo: "Configurações de Integração (/app/integrations/manageIntegration)",
    perfis: ["Administrador do marketplace"],
    prioridade: "[a preencher]",
    problema:
      "Hoje, as integrações de Backoffice (hubs, ERPs e plataformas como Anymarket, VTEX, Tray, Tiny e Bling) recebem o pedido assim que ele é criado, ainda em Aguardando Pagamento. O marketplace paga tarifa por pedido integrado em hubs como o Anymarket (ex.: 0,4%), mesmo quando o pagamento nunca é aprovado, e o lojista tem retrabalho para cancelar pedidos não pagos e estoque reservado sem necessidade.",
    solucao:
      "O administrador do marketplace passa a ter, em cada integração de Backoffice, a opção \"Integrar apenas pedidos com pagamentos aprovados\". Com ela marcada, o pedido só chega à integração quando o pagamento é aprovado; pedidos cancelados ou expirados antes disso nunca chegam. Com ela desmarcada, que é o padrão, tudo continua como hoje.",
    contexto:
      "Criar o parâmetro integrate_only_paid_orders (booleano, padrão false) nas configurações de toda integração da categoria Backoffice e fazer o motor de envio de pedidos respeitá-lo. O objetivo é não enviar pedidos sem pagamento aprovado às integrações que optarem por isso, evitando tarifa sobre venda não concretizada, cancelamentos manuais e reserva indevida de estoque. O ciclo de status do pedido não muda: o parâmetro só altera em qual status o pedido é enviado.",
    estados: [],
    regras: [
      {
        id: "RN1",
        regra:
          "integrate_only_paid_orders = false (padrão) → o pedido é enviado à integração assim que é criado, no status Aguardando Pagamento (comportamento atual).",
        exemplo: "Integração Tiny com o parâmetro desmarcado; o pedido 50001 é criado e chega ao Tiny em Aguardando Pagamento.",
      },
      {
        id: "RN2",
        regra: "integrate_only_paid_orders = true e pedido em Aguardando Pagamento → o envio à integração fica retido.",
        exemplo: "Integração Anymarket com o parâmetro marcado; o pedido 50002 é criado em Aguardando Pagamento e não chega ao Anymarket.",
      },
      {
        id: "RN3",
        regra:
          "integrate_only_paid_orders = true e pedido avança para Aguardando Faturamento → o pedido é enviado à integração nesse momento.",
        exemplo: "O pagamento do pedido 50002 é aprovado, ele vai para Aguardando Faturamento e só então chega ao Anymarket.",
      },
      {
        id: "RN4",
        regra:
          "integrate_only_paid_orders = true e pedido cancelado ou expirado antes da aprovação do pagamento → o pedido nunca é enviado à integração.",
        exemplo: "O pedido 50003 é cancelado em Aguardando Pagamento; a integração Bling, com o parâmetro marcado, nunca o recebe.",
      },
      {
        id: "RN5",
        regra:
          "O parâmetro existe em todas as integrações da categoria Backoffice e é configurado individualmente em cada uma → marcar em uma integração não altera as outras.",
        exemplo: "Tiny com o parâmetro marcado e Bling desmarcado no mesmo marketplace.",
      },
      {
        id: "RN6",
        regra: "O parâmetro e o tooltip aparecem exclusivamente na tela administrativa de gestão de integrações do marketplace.",
        exemplo: "O lojista não vê o parâmetro em nenhuma tela do painel dele.",
      },
    ],
    fluxo_decisao: `[ Novo pedido criado ]
        │
        ▼
integrate_only_paid_orders ativo na integração destino?
   ├─ NÃO → envia na criação, em Aguardando Pagamento (RN1)
   └─ SIM → status = Aguardando Faturamento?
              ├─ SIM → envia o pedido (RN3)
              └─ NÃO → retém o envio (RN2)
                        └─ cancelado ou expirado antes da aprovação → nunca envia (RN4)`,
    interface: [
      {
        elemento: "Parâmetro integrate_only_paid_orders",
        tipo: "Checkbox",
        texto_exato: "Integrar apenas pedidos com pagamentos aprovados",
        obrigatorio: false,
        regra: "Booleano, desmarcado por padrão (false). Fica logo abaixo da seção de credenciais da API.",
      },
      {
        elemento: "Ícone de ajuda do parâmetro",
        tipo: "Ícone (ℹ️) com tooltip",
        texto_exato: TOOLTIP,
        obrigatorio: false,
        regra: "O tooltip aparece ao passar o mouse ou ao focar o ícone.",
      },
    ],
    mensagens: [
      { tipo: "Aviso (tooltip)", texto: TOOLTIP },
      { tipo: "Sucesso ao salvar a configuração", texto: "[a preencher]" },
    ],
    escopo: {
      telas: ["Configurações de Integração (/app/integrations/manageIntegration)"],
      perfis: ["Administrador do marketplace"],
      integracoes: ["Todas as integrações da categoria Backoffice (ex.: Anymarket, VTEX, Tray, Tiny, Bling)"],
      limites: [],
      desempenho: "[a preencher]",
    },
    fora_de_escopo: ["Integrações que não são da categoria Backoffice.", "Mudanças no ciclo de status do pedido."],
    criterios: [
      {
        id: "CA1",
        texto:
          "Na tela de configurações de cada integração da categoria Backoffice, o checkbox \"Integrar apenas pedidos com pagamentos aprovados\" aparece logo abaixo da seção de credenciais da API.",
        regras_cobertas: ["RN5"],
      },
      {
        id: "CA2",
        texto: "Numa integração Backoffice que nunca salvou o parâmetro, o checkbox vem desmarcado (integrate_only_paid_orders = false).",
        regras_cobertas: ["RN1"],
      },
      {
        id: "CA3",
        texto: `Ao passar o mouse ou focar o ícone ℹ️ do parâmetro, o tooltip exibe exatamente: "${TOOLTIP}"`,
        regras_cobertas: [],
      },
      {
        id: "CA4",
        texto: "O parâmetro e o tooltip não aparecem em nenhuma tela fora da gestão de integrações do marketplace.",
        regras_cobertas: ["RN6"],
      },
      {
        id: "CA5",
        texto: "Com o parâmetro desmarcado, o pedido chega à integração na criação, no status Aguardando Pagamento.",
        regras_cobertas: ["RN1"],
      },
      {
        id: "CA6",
        texto: "Com o parâmetro marcado, um pedido em Aguardando Pagamento não é enviado à integração.",
        regras_cobertas: ["RN2"],
      },
      {
        id: "CA7",
        texto: "Com o parâmetro marcado, o pedido é enviado à integração quando avança para Aguardando Faturamento.",
        regras_cobertas: ["RN3"],
      },
      {
        id: "CA8",
        texto: "Com o parâmetro marcado, um pedido cancelado ou expirado antes da aprovação do pagamento nunca é enviado à integração.",
        regras_cobertas: ["RN4"],
      },
      {
        id: "CA9",
        texto: "Marcar o parâmetro numa integração não altera o valor dele nas outras integrações Backoffice.",
        regras_cobertas: ["RN5"],
      },
    ],
    casos: [
      {
        id: "CT1",
        criterio: "CA1",
        tipo: "feliz",
        dado: "o administrador do marketplace na tela de configurações da integração Tiny (categoria Backoffice)",
        quando: "a tela carrega",
        entao: "o checkbox \"Integrar apenas pedidos com pagamentos aprovados\" aparece logo abaixo da seção de credenciais da API",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição válida: integração da categoria Backoffice",
      },
      {
        id: "CT2",
        criterio: "CA2",
        tipo: "feliz",
        dado: "a integração Bling, que nunca salvou o parâmetro",
        quando: "o administrador abre a tela de configurações",
        entao: "o checkbox está desmarcado",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Valor padrão do parâmetro (false)",
      },
      {
        id: "CT3",
        criterio: "CA3",
        tipo: "feliz",
        dado: "a tela de configurações da integração Anymarket",
        quando: "o administrador passa o mouse no ícone ℹ️ do parâmetro",
        entao: "o tooltip exibe exatamente o texto definido no CA3",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Exibição do tooltip por hover",
      },
      {
        id: "CT4",
        criterio: "CA4",
        tipo: "feliz",
        dado: "um lojista logado no painel do seller",
        quando: "ele navega pelas telas de configuração disponíveis para ele",
        entao: "o parâmetro e o tooltip não aparecem em nenhuma delas",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição: telas fora da gestão de integrações do marketplace",
      },
      {
        id: "CT5",
        criterio: "CA5",
        tipo: "feliz",
        dado: "a integração Tiny com o parâmetro desmarcado",
        quando: "o pedido 50001 é criado em Aguardando Pagamento",
        entao: "o pedido 50001 chega ao Tiny na criação, em Aguardando Pagamento",
        tecnica: "Tabela de decisão (4.2.3)",
        item_cobertura: "Coluna 1: parâmetro = Não",
      },
      {
        id: "CT6",
        criterio: "CA6",
        tipo: "feliz",
        dado: "a integração Anymarket com o parâmetro marcado",
        quando: "o pedido 50002 é criado em Aguardando Pagamento",
        entao: "o pedido 50002 não é enviado ao Anymarket",
        tecnica: "Tabela de decisão (4.2.3)",
        item_cobertura: "Coluna 2: parâmetro = Sim, status = Aguardando Pagamento",
      },
      {
        id: "CT7",
        criterio: "CA7",
        tipo: "feliz",
        dado: "a integração Anymarket com o parâmetro marcado e o pedido 50002 retido em Aguardando Pagamento",
        quando: "o pagamento é aprovado e o pedido avança para Aguardando Faturamento",
        entao: "o pedido 50002 é enviado ao Anymarket nesse momento",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição Aguardando Pagamento → Aguardando Faturamento (coluna 3 da tabela de decisão)",
      },
      {
        id: "CT8",
        criterio: "CA8",
        tipo: "feliz",
        dado: "a integração Bling com o parâmetro marcado e o pedido 50003 em Aguardando Pagamento",
        quando: "o pedido 50003 é cancelado",
        entao: "o pedido 50003 nunca é enviado ao Bling",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição Aguardando Pagamento → Cancelado",
      },
      {
        id: "CT9",
        criterio: "CA9",
        tipo: "feliz",
        dado: "as integrações Tiny e Bling com o parâmetro desmarcado",
        quando: "o administrador marca e salva o parâmetro só no Tiny",
        entao: "o parâmetro da Bling continua desmarcado",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Configuração independente por integração",
      },
      {
        id: "CT10",
        criterio: "CA3",
        tipo: "alternativo",
        dado: "a tela de configurações da integração Anymarket",
        quando: "o administrador chega ao ícone ℹ️ pelo teclado (Tab)",
        entao: "o tooltip exibe o mesmo texto do CA3",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Exibição do tooltip por foco",
      },
      {
        id: "CT11",
        criterio: "CA8",
        tipo: "alternativo",
        dado: "a integração Bling com o parâmetro marcado e o pedido 50004 em Aguardando Pagamento",
        quando: "o pedido 50004 expira sem pagamento",
        entao: "o pedido 50004 nunca é enviado ao Bling",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição Aguardando Pagamento → Expirado",
      },
      {
        id: "CT12",
        criterio: "CA5",
        tipo: "alternativo",
        dado: "a integração Tiny com o parâmetro marcado",
        quando: "o administrador desmarca o parâmetro, salva e o pedido 50005 é criado",
        entao: "o pedido 50005 chega ao Tiny na criação, em Aguardando Pagamento",
        tecnica: "Tabela de decisão (4.2.3)",
        item_cobertura: "Coluna 1 após mudar o parâmetro de Sim para Não",
      },
      {
        id: "CT13",
        criterio: "CA1",
        tipo: "negativo",
        dado: "uma integração que não é da categoria Backoffice [a preencher: nome de uma categoria]",
        quando: "o administrador abre a tela de configurações dela",
        entao: "o checkbox não aparece",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição inválida: integração fora da categoria Backoffice",
      },
      {
        id: "CT14",
        criterio: "CA4",
        tipo: "negativo",
        dado: "um usuário do marketplace sem permissão de administrar integrações [a preencher: nome do perfil]",
        quando: "ele tenta abrir a gestão de integrações",
        entao: "[a preencher: acesso negado ou parâmetro só para leitura]",
        tecnica: "Baseada em experiência (4.4)",
        item_cobertura: "Perfil sem permissão",
      },
      {
        id: "CT15",
        criterio: "CA7",
        tipo: "nao_funcional",
        dado: "a integração Anymarket com o parâmetro marcado",
        quando: "o pagamento do pedido 50006 é aprovado",
        entao: "o pedido chega ao Anymarket em até [a preencher] após entrar em Aguardando Faturamento",
        tecnica: "Baseada em experiência (4.4)",
        item_cobertura: "Tempo entre a aprovação e o envio",
      },
      {
        id: "CT16",
        criterio: "CA8",
        tipo: "nao_funcional",
        dado: "a integração Anymarket com o parâmetro marcado",
        quando: "o pedido 50007 é cancelado antes da aprovação",
        entao: "o log de integração não registra nenhuma chamada de criação do pedido 50007 para o Anymarket",
        tecnica: "Baseada em experiência (4.4)",
        item_cobertura: "Impacto na integração: nenhuma chamada à API do hub",
      },
    ],
    revisao: {
      checklist: [
        { item: "Todas as seções preenchidas e numeradas", ok: true },
        { item: "Cada regra tem critério e cada critério tem caso feliz", ok: true },
        { item: "Cada limite numérico tem caso de máximo e máximo+1 (a entrada não cita limites numéricos)", ok: true },
        { item: "Todo comportamento tem mensagem com texto exato", ok: false },
        { item: "Nenhuma palavra que não dá para testar", ok: true },
        { item: "Nomes consistentes", ok: false },
        { item: "Tamanho adequado (INVEST)", ok: true },
      ],
      duvidas: [
        {
          trecho: "avançar para Aguardando Faturamento (Pagamento Aprovado)",
          pergunta:
            "\"Aguardando Faturamento\" e \"Pagamento Aprovado\" são o mesmo status? Qual nome aparece no sistema? A issue usa \"Aguardando Faturamento\".",
        },
        {
          trecho: "O sistema retém a notificação/envio do pedido para a plataforma conectada enquanto o status for Aguardando Pagamento.",
          pergunta:
            "Se o administrador desmarcar o parâmetro com pedidos retidos em Aguardando Pagamento, esses pedidos são enviados na hora, só quando forem aprovados, ou nunca?",
        },
        {
          trecho: "A mensagem e o parâmetro são visíveis exclusivamente na tela administrativa de gestão de integrações do marketplace.",
          pergunta:
            "Quais perfis do marketplace podem ver e alterar o parâmetro? O que um usuário sem essa permissão vê (CT14)?",
        },
        {
          trecho: "todas as integrações cadastradas como tipo Backoffice",
          pergunta:
            "Integrações Backoffice cadastradas no futuro recebem o parâmetro automaticamente? Qual o nome de uma categoria que não é Backoffice, para o caso negativo CT13?",
        },
        {
          trecho: "adicionar o novo parâmetro logo abaixo da seção de credenciais da API",
          pergunta: "Ao salvar a configuração, aparece alguma mensagem? Qual o texto exato?",
        },
        {
          trecho: "O envio do pedido para o ERP/Hub/Plataforma é acionado apenas quando o status do pedido no Portal do Seller avançar para Aguardando Faturamento",
          pergunta: "Em quanto tempo, no máximo, o pedido deve chegar à integração depois de entrar em Aguardando Faturamento (CT15)?",
        },
        {
          trecho: "isentando tarifas operacionais e custos de taxa sobre vendas não concretizadas",
          pergunta:
            "O administrador ou o lojista precisa ver na tela que um pedido está retido aguardando pagamento? Se sim, qual o texto?",
        },
        { trecho: "(prioridade não informada)", pergunta: "Qual a prioridade desta issue?" },
      ],
    },
  },
};
