import type { Exemplo } from "../entrada.js";

// Exemplo 2: ciclo de vida + limite de 2.500 linhas. A entrada tem problemas reais de propósito;
// a revisão mostra como apontá-los (status com dois nomes, título que contradiz a regra, limite sem
// critério nem caso, palavra não testável, seção faltando).

const descricao = `Ajuste Técnico / Otimização de Onboarding Atualmente, o Core do sistema barra a integração de produtos se a marca informada estiver inexistente ou inativa no Portal do Seller. Isso gera um atrito massivo no onboarding de novos catálogos (Sellers com milhares de SKUs travados). Além disso, a sincronização de marcas com os marketplaces (VTEX, OCC, Wake) é unidirecional e falha ao lidar com a existência da marca em apenas uma das pontas. Outro problema é que, ao criar uma marca nova na ingestão de um produto, o sistema a jogava direto no status "Inativa", misturando marcas novas que precisam ser homologadas com marcas que foram propositalmente desativadas.`;

const contexto = `Solução
Implementar a nova Fila de Auto-Remediação e Gestão de Marcas Bidirecional.
O produto passará a ser integrado com sucesso nmesmo que a marca seja nova ou desconhecida.
Instituir um novo status chamado "Aguardando Criação" para isolar marcas novas enviadas pelos Sellers, diferenciando-as das marcas "Inativas".
Garantir o vínculo inteligente: se a marca for criada em uma ponta e já existir na outra, o sistema realiza o match textual e unifica os IDs.
Manter uma rotina semanal assíncrona para consultar e atualizar marcas que tenham sido cadastradas diretamente nos canais de venda.

Requisito Técnico
1. Contexto e Objetivo
Desacoplar a obrigatoriedade de cadastro prévio de marcas na ingestão de produtos e instituir um motor de normalização, ciclo de vida com status bem definidos, rotina semanal de atualização ativa e vínculo automático/manual entre o Portal do Seller e os Marketplaces conectados.

2. Ciclo de Vida da Marca e Filtros de Status (UI/UX)
Alterar a tela de marcas conforme o protótipo para que exiba os filtros de marcas no sistema
Ativo: Marca criada e disponível para publicação de produtos em qualquer canal.
Inativo: Marca desativada deliberadamente pelo administrador. Produtos atrelados a ela não são publicados e derrubados do site.
Pendente: Marca retida e aguarda a ação manual do operador para validação.
Rejeitado: Marcas enviadas pelo Seller que foram recusadas pelo administrador do marketplace.
Erro: Marcas que falharam na tentativa de sincronização assíncrona com as APIs dos canais por timeout ou erro de schema.

3. Comportamento do Core e Flexibilização (Ingestão de Produtos)
Remoção de Bloqueio: Alterar a camada de validação de produtos. O erro "Marca inexistente ou inativa" fica extinto na entrada para novos produtos no Portal do Seller.
Gatilho de Entrada de Nova Marca: Se um produto for enviado via API/Integração com uma marca não cadastrada no Portal do Seller, o sistema deve salvar o produto com sucesso, criar a marca banco com o status "Pendente" na tela de Marcas.

4. Especificações de Interface e Ações (UI/UX)
A. Aba Gestão de Marcas (Interface de Conciliação)
Seguindo os protótipos fornecidos, a listagem de marcas deve exibir de forma clara os status e as origens:
Nome da Marca, Origem (Marketplace ou Seller), Produtos (Quantidade de SKUs impactados), Status e Ações.
Ações Individuais disponíveis para marcas em análise:
[Criar]: Grava a marca definitivamente como "Ativo" e dispara a criação no Marketplace (unificando o vínculo).
[Rejeitar]: Recusa a marca inserida pelo Seller, movendo-a para o status correspondente e travando os produtos vinculados.
[Tentar novamente]: Visível apenas para itens com o status de Erro. Reexecuta a chamada de API de sincronização com o canal.

B. Importação em Massa (Planilha)
Na tela Importação de Marcas em Massa, permitir o upload de arquivo CSV separado por ponto e vírgula (;), limitado a 2500 marcas por carga
Colunas Obrigatórias: nome_da_marca, acao (criar, ativar, inativar).
Nota: A ação criar via planilha insere a marca diretamente como "Ativo" ou no fluxo de homologação configurado.
As ações deverão refletir no marketplace

6. Regras de Negócio e Tratamento de "Brechas"
Job de Consulta Semanal (Background Polling): O sistema deve manter ativa uma rotina de consulta que busca as marcas diretamente na API do marketplace (VTEX, OCC, Wake). Para evitar sobrecarga, esse Job deve rodar estritamente 1 vez por semana (configurado via Cron, preferencialmente nas madrugadas de domingo). Se encontrar uma nova marca cadastrada na ponta do canal, o sistema deve espelhar essa marca localmente no Portal do Seller, aplicando as regras de validação de duplicidade abaixo.

Vínculo Inteligente e Normalização (Case Sensitive):
Antes de criar qualquer marca em qualquer status (seja via tela, planilha, API ou pelo Job semanal), o sistema deve aplicar LOWER().
Se o Marketplace tentar puxar a marca "REEBOK" e no Portal do Seller já existir "Reebok" (em qualquer status), o sistema não cria um novo registro. Ele identifica a similaridade gráfica, unifica os registros sob o mesmo ID interno e atualiza o vínculo.

Inativação e Impacto em Cascata:
Se o usuário alterar o status de uma marca para Inativo (via tela ou planilha), o sistema deve varrer o catálogo.
Trava de Segurança: Antes de confirmar a inativação, um modal na tela deve exibir: "Atenção: Existem X produtos ativos associados a esta marca. Deseja inativar a marca e todos os seus produtos no marketplace?". Caso confirme, os produtos correspondentes mudam para inativos no canal.

7. Critérios de Aceite
[ ] Produtos integrados com marcas desconhecidas são salvos com sucesso e criam a marca com o status "Aguardando Criação".
[ ] O seletor de filtros exibe exatamente as opções: Todos os status, Ativo, Pendente, Inativo, Rejeitado e Erro.
[ ] Existe um Cronjob configurado para executar 1 vez por semana que realiza a varredura ativa de marcas cadastradas diretamente nas APIs dos marketplaces.
[ ] O sistema impede a criação física de duplicatas textuais (ex: "Nike" e "NIKE" mapeiam para a mesma entidade, unificando os IDs).
[ ] O importador de planilha aceita arquivos CSV processando criações e inativações em lote perfeitamente.
[ ] Se uma marca já existir no Marketplace, ao tentar criá-la pelo Portal do Seller, o sistema apenas vincula os IDs existentes ao invés de duplicar.`;

const MODAL =
  "Atenção: Existem X produtos ativos associados a esta marca. Deseja inativar a marca e todos os seus produtos no marketplace?";
const STATUS_ENTRADA = "[a preencher: \"Pendente\" ou \"Aguardando Criação\"]";

export const exemploGestaoDeMarcas: Exemplo = {
  nome: "Gestão de Marcas com status e importação CSV",
  entrada: { tipo: "Ajuste técnico", produto: "Portal do Seller", descricao, contexto },
  saida: {
    titulo: "Gestão de Marcas com status e importação CSV",
    tipo: "Ajuste técnico",
    produto: "Portal do Seller",
    modulo: "Gestão de Marcas; Importação de Marcas em Massa; ingestão de produtos (API/Integração)",
    perfis: ["Seller", "Operador", "Administrador do marketplace"],
    prioridade: "[a preencher]",
    problema:
      "Hoje, o produto enviado por um seller é recusado quando a marca não existe ou está inativa no Portal do Seller, e catálogos inteiros ficam travados no onboarding. A sincronização de marcas com os canais (VTEX, OCC, Wake) só funciona num sentido e falha quando a marca existe em apenas um dos lados. E a marca nova criada na entrada de um produto vai direto para \"Inativa\", misturada com as marcas que o administrador desativou de propósito.",
    solucao:
      "O produto passa a ser salvo mesmo com marca nova ou desconhecida, e a marca nova fica num status próprio, à espera de validação do operador. O operador cria ou rejeita cada marca na tela de Gestão de Marcas, ou em massa por planilha. Nomes iguais, com maiúsculas diferentes, passam a ser a mesma marca nos dois lados, e uma rotina semanal traz as marcas cadastradas direto nos canais.",
    contexto:
      "Desacoplar o cadastro prévio de marca da ingestão de produtos e criar: normalização de nomes, ciclo de vida da marca com status definidos, vínculo automático/manual entre o Portal do Seller e os marketplaces conectados, importação em massa por CSV, rotina semanal de consulta aos canais e inativação em cascata dos produtos.",
    estados: [
      {
        status: "Pendente",
        significado:
          "Marca retida, aguardando ação manual do operador para validação. A Solução e o CA1 da entrada chamam este status de \"Aguardando Criação\" (ver dúvida 1).",
        vai_para: ["Ativo", "Rejeitado"],
        quem_muda: "Operador ([Criar] ou [Rejeitar])",
      },
      {
        status: "Ativo",
        significado: "Marca criada e disponível para publicação de produtos em qualquer canal.",
        vai_para: ["Inativo"],
        quem_muda: "Administrador (tela ou planilha)",
      },
      {
        status: "Inativo",
        significado: "Marca desativada deliberadamente pelo administrador; os produtos dela não são publicados e saem do site.",
        vai_para: ["Ativo"],
        quem_muda: "Administrador (planilha, ação ativar)",
      },
      {
        status: "Rejeitado",
        significado: "Marca enviada pelo Seller e recusada pelo administrador do marketplace.",
        vai_para: ["[a preencher]"],
        quem_muda: "[a preencher]",
      },
      {
        status: "Erro",
        significado: "Marca cuja sincronização assíncrona com a API do canal falhou (timeout ou erro de schema).",
        vai_para: ["[a preencher]"],
        quem_muda: "Sistema (na falha); Operador ([Tentar novamente])",
      },
    ],
    regras: [
      {
        id: "RN1",
        regra: `Produto enviado via API/Integração com marca não cadastrada → o produto é salvo com sucesso e a marca é criada com o status ${STATUS_ENTRADA}.`,
        exemplo: "O produto AUR-001 chega com a marca \"Marca Aurora\", que não existe; o produto é salvo e a marca aparece na Gestão de Marcas.",
      },
      {
        id: "RN2",
        regra: "Entrada de novo produto → o erro \"Marca inexistente ou inativa\" não é mais retornado.",
        exemplo: "O produto AUR-002 com a marca inexistente \"Marca Aurora\" não recebe esse erro.",
      },
      {
        id: "RN3",
        regra:
          "Antes de criar qualquer marca (tela, planilha, API ou Job semanal), o nome passa por LOWER() → se já existe marca com o mesmo nome, em qualquer status, não é criado registro novo: os registros ficam sob o mesmo ID interno e o vínculo é atualizado.",
        exemplo: "O canal traz \"REEBOK\" e o Portal do Seller já tem \"Reebok\" Inativo; nenhuma marca nova é criada.",
      },
      {
        id: "RN4",
        regra: "Criar no Portal do Seller uma marca que já existe no marketplace → apenas vincula os IDs existentes, sem duplicar.",
        exemplo: "\"Marca Boreal\" já existe na VTEX; ao criá-la no Portal do Seller, o portal usa o ID da VTEX.",
      },
      {
        id: "RN5",
        regra: "Ação [Criar] numa marca em análise → a marca vai para Ativo e a criação é disparada no marketplace, unificando o vínculo.",
        exemplo: "\"Marca Aurora\" em análise; o operador clica em [Criar] e ela fica Ativo e criada na VTEX.",
      },
      {
        id: "RN6",
        regra: "Ação [Rejeitar] numa marca enviada pelo Seller → a marca vai para Rejeitado e os produtos vinculados ficam travados.",
        exemplo: "\"Marca Zeta\" com 4 produtos; o operador clica em [Rejeitar] e os 4 ficam travados.",
      },
      {
        id: "RN7",
        regra: "Sincronização assíncrona com a API do canal falha por timeout ou erro de schema → a marca vai para Erro.",
        exemplo: "A criação de \"Marca Cobalto\" na OCC expira por timeout; a marca aparece com status Erro.",
      },
      {
        id: "RN8",
        regra: "Marca com status Erro → a ação [Tentar novamente] aparece e reexecuta a chamada de sincronização; em outros status, ela não aparece.",
        exemplo: "\"Marca Cobalto\" em Erro mostra [Tentar novamente]; \"Marca Aurora\" Ativo não mostra.",
      },
      {
        id: "RN9",
        regra:
          "Importação em massa → aceita CSV separado por ponto e vírgula (;), com até 2.500 marcas por carga e as colunas obrigatórias nome_da_marca e acao.",
        exemplo: "marcas.csv com a linha \"marca alfa;criar\" e mais 9 linhas é aceito.",
      },
      {
        id: "RN10",
        regra:
          "Cada linha do CSV aplica a acao (criar, ativar ou inativar), e a ação reflete no marketplace; criar deixa a marca Ativo ou a envia ao fluxo de homologação configurado [a preencher: qual vale].",
        exemplo: "\"marca beta;ativar\" deixa \"Marca Beta\" Ativo no portal e no canal.",
      },
      {
        id: "RN11",
        regra:
          "Job semanal (Cron, 1 vez por semana) consulta as marcas nas APIs dos canais (VTEX, OCC, Wake) → cada marca nova encontrada é espelhada no Portal do Seller, aplicando a RN3.",
        exemplo: "\"Marca Cobalto\" foi cadastrada direto na Wake; na execução seguinte do job ela aparece no portal.",
      },
      {
        id: "RN12",
        regra: `Alterar uma marca para Inativo → antes de confirmar, o modal exibe: "${MODAL}"`,
        exemplo: "\"Marca Delta\" tem 12 produtos ativos; o modal diz \"Existem 12 produtos ativos\".",
      },
      {
        id: "RN13",
        regra: "Inativação confirmada → a marca vai para Inativo e os produtos ativos associados a ela mudam para inativos no canal.",
        exemplo: "O operador confirma a inativação de \"Marca Delta\" e os 12 produtos ficam inativos na VTEX.",
      },
      {
        id: "RN14",
        regra: "Marca Inativo → os produtos dela não são publicados e saem do site.",
        exemplo: "Com \"Marca Delta\" Inativo, a página do produto DEL-010 deixa de aparecer no site.",
      },
    ],
    fluxo_decisao: `[ Marca chega: tela | planilha | API de produto | Job semanal ]
        │
        ▼
LOWER(nome) já existe no Portal do Seller (qualquer status)?
   ├─ SIM → não cria; unifica sob o mesmo ID interno e atualiza o vínculo (RN3)
   └─ NÃO → cria a marca:
              ├─ origem API/Integração de produto → ${STATUS_ENTRADA} (RN1)
              ├─ origem planilha (acao = criar) → Ativo ou fluxo de homologação [a preencher] (RN10)
              └─ origem Job semanal → [a preencher: status da marca espelhada] (RN11)`,
    interface: [
      {
        elemento: "Listagem de marcas",
        tipo: "Tabela",
        texto_exato: "Nome da Marca · Origem · Produtos · Status · Ações",
        obrigatorio: false,
        regra: "Origem: Marketplace ou Seller. Produtos: quantidade de SKUs impactados.",
      },
      {
        elemento: "Filtro de status",
        tipo: "Seletor",
        texto_exato: "Todos os status, Ativo, Pendente, Inativo, Rejeitado, Erro",
        obrigatorio: false,
        regra: "Exatamente essas 6 opções.",
      },
      {
        elemento: "Ação Criar",
        tipo: "Botão",
        texto_exato: "Criar",
        obrigatorio: false,
        regra: "Disponível para marcas em análise [a preencher: em quais status].",
      },
      {
        elemento: "Ação Rejeitar",
        tipo: "Botão",
        texto_exato: "Rejeitar",
        obrigatorio: false,
        regra: "Disponível para marcas em análise enviadas pelo Seller [a preencher: em quais status].",
      },
      {
        elemento: "Ação Tentar novamente",
        tipo: "Botão",
        texto_exato: "Tentar novamente",
        obrigatorio: false,
        regra: "Visível apenas no status Erro.",
      },
      {
        elemento: "Upload da planilha",
        tipo: "Campo de arquivo",
        texto_exato: "[a preencher]",
        obrigatorio: true,
        regra: "CSV separado por ; com até 2.500 marcas por carga; colunas obrigatórias nome_da_marca e acao (criar, ativar, inativar).",
      },
      {
        elemento: "Modal de inativação",
        tipo: "Modal de confirmação",
        texto_exato: MODAL,
        obrigatorio: false,
        regra: "X = quantidade de produtos ativos da marca. Botões: [a preencher].",
      },
    ],
    mensagens: [
      { tipo: "Confirmação (modal de inativação)", texto: MODAL },
      { tipo: "Erro: planilha com mais de 2.500 marcas", texto: "[a preencher]" },
      { tipo: "Erro: coluna obrigatória ausente ou separador inválido", texto: "[a preencher]" },
      { tipo: "Erro: acao fora de criar, ativar ou inativar", texto: "[a preencher]" },
      { tipo: "Sucesso da importação", texto: "[a preencher]" },
    ],
    escopo: {
      telas: ["Gestão de Marcas", "Importação de Marcas em Massa", "Ingestão de produtos (API/Integração)"],
      perfis: ["Seller", "Operador", "Administrador do marketplace"],
      integracoes: ["VTEX", "OCC", "Wake"],
      limites: ["Até 2.500 marcas por carga de CSV", "Job de consulta: 1 vez por semana"],
      desempenho: "O job roda 1 vez por semana para evitar sobrecarga. Tempo de processamento da planilha: [a preencher].",
    },
    fora_de_escopo: ["Produtos que já existiam: a remoção do bloqueio vale para a entrada de novos produtos."],
    criterios: [
      {
        id: "CA1",
        texto: "Um produto enviado via API/Integração com marca não cadastrada é salvo com sucesso, sem o erro \"Marca inexistente ou inativa\".",
        regras_cobertas: ["RN1", "RN2"],
      },
      { id: "CA2", texto: `A marca criada nesse caso fica com o status ${STATUS_ENTRADA}.`, regras_cobertas: ["RN1"] },
      {
        id: "CA3",
        texto: "O filtro de status exibe exatamente as opções: Todos os status, Ativo, Pendente, Inativo, Rejeitado e Erro.",
        regras_cobertas: [],
      },
      {
        id: "CA4",
        texto: "A listagem de marcas exibe as colunas Nome da Marca, Origem, Produtos, Status e Ações.",
        regras_cobertas: [],
      },
      {
        id: "CA5",
        texto: "Uma marca cujo nome, após LOWER(), já existe em qualquer status não gera registro novo: os registros ficam sob o mesmo ID interno.",
        regras_cobertas: ["RN3"],
      },
      {
        id: "CA6",
        texto: "Criar no Portal do Seller uma marca que já existe no marketplace apenas vincula os IDs existentes.",
        regras_cobertas: ["RN4"],
      },
      {
        id: "CA7",
        texto: "A ação [Criar] numa marca em análise deixa a marca Ativo e a cria no marketplace.",
        regras_cobertas: ["RN5"],
      },
      {
        id: "CA8",
        texto: "A ação [Rejeitar] deixa a marca Rejeitado e trava os produtos vinculados [a preencher: o que significa travar].",
        regras_cobertas: ["RN6"],
      },
      {
        id: "CA9",
        texto: "Uma falha de sincronização com o canal por timeout ou erro de schema deixa a marca com status Erro.",
        regras_cobertas: ["RN7"],
      },
      {
        id: "CA10",
        texto: "A ação [Tentar novamente] aparece só para marcas com status Erro e reexecuta a sincronização.",
        regras_cobertas: ["RN8"],
      },
      {
        id: "CA11",
        texto: "O upload da Importação de Marcas em Massa aceita CSV separado por ; com até 2.500 marcas e as colunas nome_da_marca e acao.",
        regras_cobertas: ["RN9"],
      },
      {
        id: "CA12",
        texto: "Cada linha do CSV aplica a acao (criar, ativar ou inativar) e a mudança aparece no marketplace.",
        regras_cobertas: ["RN10"],
      },
      {
        id: "CA13",
        texto: "O job roda 1 vez por semana e espelha no Portal do Seller as marcas novas encontradas na VTEX, OCC e Wake, aplicando a unificação da RN3.",
        regras_cobertas: ["RN11"],
      },
      {
        id: "CA14",
        texto: `Ao alterar uma marca para Inativo, o modal exibe "${MODAL}", com X igual à quantidade de produtos ativos, antes de confirmar.`,
        regras_cobertas: ["RN12"],
      },
      {
        id: "CA15",
        texto: "Ao confirmar a inativação, a marca fica Inativo e os produtos ativos dela ficam inativos no canal e saem do site.",
        regras_cobertas: ["RN13", "RN14"],
      },
    ],
    casos: [
      {
        id: "CT1",
        criterio: "CA1",
        tipo: "feliz",
        dado: "a marca \"Marca Aurora\" não está cadastrada",
        quando: "a integração envia o produto AUR-001 com essa marca",
        entao: "o produto AUR-001 é salvo, sem o erro \"Marca inexistente ou inativa\"",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição: marca não cadastrada",
      },
      {
        id: "CT2",
        criterio: "CA2",
        tipo: "feliz",
        dado: "o produto AUR-001 foi salvo com a marca nova \"Marca Aurora\"",
        quando: "o operador abre a Gestão de Marcas",
        entao: `"Marca Aurora" aparece com Origem Seller e status ${STATUS_ENTRADA}`,
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Estado inicial da marca criada na ingestão",
      },
      {
        id: "CT3",
        criterio: "CA3",
        tipo: "feliz",
        dado: "o operador na Gestão de Marcas",
        quando: "abre o filtro de status",
        entao: "vê exatamente 6 opções: Todos os status, Ativo, Pendente, Inativo, Rejeitado e Erro",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Lista completa de opções do filtro",
      },
      {
        id: "CT4",
        criterio: "CA4",
        tipo: "feliz",
        dado: "marcas cadastradas com origens Marketplace e Seller",
        quando: "o operador abre a Gestão de Marcas",
        entao: "a listagem mostra as colunas Nome da Marca, Origem, Produtos, Status e Ações",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Colunas da listagem",
      },
      {
        id: "CT5",
        criterio: "CA5",
        tipo: "feliz",
        dado: "\"Reebok\" existe no Portal do Seller com status Inativo",
        quando: "o job semanal traz \"REEBOK\" do canal",
        entao: "nenhuma marca nova é criada e \"Reebok\" mantém o mesmo ID interno, agora vinculado ao canal",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição: nome igual após LOWER()",
      },
      {
        id: "CT6",
        criterio: "CA6",
        tipo: "feliz",
        dado: "\"Marca Boreal\" existe na VTEX e não existe no Portal do Seller",
        quando: "o administrador cria \"Marca Boreal\" no portal",
        entao: "o portal vincula o ID existente da VTEX e nenhuma marca nova é criada na VTEX",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição: marca existente só no marketplace",
      },
      {
        id: "CT7",
        criterio: "CA7",
        tipo: "feliz",
        dado: "\"Marca Aurora\" em análise",
        quando: "o operador clica em [Criar]",
        entao: "\"Marca Aurora\" fica Ativo e é criada no marketplace",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição Pendente → Ativo",
      },
      {
        id: "CT8",
        criterio: "CA8",
        tipo: "feliz",
        dado: "\"Marca Zeta\", enviada pelo Seller, em análise e com 4 produtos",
        quando: "o operador clica em [Rejeitar]",
        entao: "\"Marca Zeta\" fica Rejeitado e os 4 produtos ficam travados",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição Pendente → Rejeitado",
      },
      {
        id: "CT9",
        criterio: "CA9",
        tipo: "feliz",
        dado: "a API da OCC responde com timeout",
        quando: "o operador cria \"Marca Cobalto\" e a sincronização com a OCC roda",
        entao: "\"Marca Cobalto\" fica com status Erro",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição para Erro por timeout",
      },
      {
        id: "CT10",
        criterio: "CA10",
        tipo: "feliz",
        dado: "\"Marca Cobalto\" com status Erro e a OCC respondendo normalmente",
        quando: "o operador clica em [Tentar novamente]",
        entao: "a chamada de sincronização com a OCC é reexecutada e a marca vai para [a preencher: status após sucesso]",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Evento Tentar novamente a partir de Erro",
      },
      {
        id: "CT11",
        criterio: "CA11",
        tipo: "feliz",
        dado: "o arquivo marcas.csv separado por ;, com as colunas nome_da_marca e acao e 10 linhas",
        quando: "o administrador faz o upload na Importação de Marcas em Massa",
        entao: "o arquivo é aceito e as 10 linhas são processadas",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição válida: CSV no formato correto",
      },
      {
        id: "CT12",
        criterio: "CA12",
        tipo: "feliz",
        dado: "um CSV com as linhas \"marca alfa;criar\", \"marca beta;ativar\" e \"marca gama;inativar\"",
        quando: "o administrador importa o arquivo",
        entao: "\"Marca Alfa\" é criada, \"Marca Beta\" fica Ativo e \"Marca Gama\" fica Inativo, no portal e no marketplace",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "As 3 partições válidas de acao",
      },
      {
        id: "CT13",
        criterio: "CA13",
        tipo: "feliz",
        dado: "\"Marca Cobalto\" foi cadastrada direto na Wake e não existe no portal",
        quando: "o job semanal executa",
        entao: "\"Marca Cobalto\" aparece no Portal do Seller com status [a preencher]",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição: marca nova só no canal",
      },
      {
        id: "CT14",
        criterio: "CA14",
        tipo: "feliz",
        dado: "\"Marca Delta\" Ativo com 12 produtos ativos",
        quando: "o administrador altera o status para Inativo na tela",
        entao: "o modal exibe \"Atenção: Existem 12 produtos ativos associados a esta marca. Deseja inativar a marca e todos os seus produtos no marketplace?\"",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Modal com X = 12",
      },
      {
        id: "CT15",
        criterio: "CA15",
        tipo: "feliz",
        dado: "o modal de inativação de \"Marca Delta\" aberto",
        quando: "o administrador confirma",
        entao: "\"Marca Delta\" fica Inativo e os 12 produtos ficam inativos na VTEX e saem do site",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição Ativo → Inativo",
      },
      {
        id: "CT16",
        criterio: "CA5",
        tipo: "alternativo",
        dado: "\"Nike\" existe no portal com status Pendente",
        quando: "o administrador importa um CSV com a linha \"NIKE;criar\"",
        entao: "nenhuma marca nova é criada; a linha atua sobre \"Nike\", com o mesmo ID interno",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Nome igual após LOWER(), origem planilha",
      },
      {
        id: "CT17",
        criterio: "CA5",
        tipo: "alternativo",
        dado: "\"Nike\" existe no portal com status Ativo",
        quando: "a integração envia o produto NIK-001 com a marca \"NIKE\"",
        entao: "o produto é salvo vinculado a \"Nike\" e nenhuma marca nova é criada",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Nome igual após LOWER(), origem API de produto",
      },
      {
        id: "CT18",
        criterio: "CA15",
        tipo: "alternativo",
        dado: "\"Marca Delta\" Ativo com 12 produtos ativos",
        quando: "o administrador importa um CSV com a linha \"marca delta;inativar\"",
        entao: "\"Marca Delta\" fica Inativo e os 12 produtos ficam inativos no canal [a preencher: há confirmação na planilha?]",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição Ativo → Inativo pela planilha",
      },
      {
        id: "CT19",
        criterio: "CA12",
        tipo: "alternativo",
        dado: "\"Marca Gama\" com status Inativo",
        quando: "o administrador importa um CSV com a linha \"marca gama;ativar\"",
        entao: "\"Marca Gama\" fica Ativo no portal e no marketplace",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição Inativo → Ativo",
      },
      {
        id: "CT20",
        criterio: "CA11",
        tipo: "negativo",
        dado: "um CSV separado por vírgula",
        quando: "o administrador faz o upload",
        entao: "o arquivo é recusado com a mensagem [a preencher]",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição inválida: separador diferente de ;",
      },
      {
        id: "CT21",
        criterio: "CA11",
        tipo: "negativo",
        dado: "um CSV separado por ; sem a coluna acao",
        quando: "o administrador faz o upload",
        entao: "o arquivo é recusado com a mensagem [a preencher]",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição inválida: coluna obrigatória ausente",
      },
      {
        id: "CT22",
        criterio: "CA12",
        tipo: "negativo",
        dado: "um CSV com a linha \"marca alfa;excluir\"",
        quando: "o administrador importa o arquivo",
        entao: "a linha é recusada com a mensagem [a preencher] e \"Marca Alfa\" não muda",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição inválida: acao fora da lista",
      },
      {
        id: "CT23",
        criterio: "CA10",
        tipo: "negativo",
        dado: "\"Marca Aurora\" com status Ativo",
        quando: "o operador olha as ações da marca",
        entao: "[Tentar novamente] não aparece",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição: status diferente de Erro",
      },
      {
        id: "CT24",
        criterio: "CA8",
        tipo: "negativo",
        dado: "\"Marca Aurora\" com status Ativo",
        quando: "o operador procura a ação [Rejeitar]",
        entao: "[Rejeitar] não aparece",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Transição proibida Ativo → Rejeitado",
      },
      {
        id: "CT25",
        criterio: "CA14",
        tipo: "negativo",
        dado: "o modal de inativação de \"Marca Delta\" aberto",
        quando: "o administrador cancela",
        entao: "\"Marca Delta\" continua Ativo e os 12 produtos continuam ativos",
        tecnica: "Transição de estados (4.2.4)",
        item_cobertura: "Inativação não confirmada: sem transição",
      },
      {
        id: "CT26",
        criterio: "CA5",
        tipo: "negativo",
        dado: "\"Reebok\" existe no portal",
        quando: "o canal traz \"Rebok\" (grafia diferente)",
        entao: "[a preencher: com LOWER(), é uma marca nova; com \"similaridade gráfica\", pode ser unificada]",
        tecnica: "Particionamento de equivalência (4.2.1)",
        item_cobertura: "Partição: nomes diferentes após LOWER()",
      },
      {
        id: "CT27",
        criterio: "CA11",
        tipo: "limite",
        dado: "um CSV válido com exatamente 2.500 marcas",
        quando: "o administrador faz o upload",
        entao: "o arquivo é aceito e as 2.500 linhas são processadas",
        tecnica: "Valor limite (4.2.2)",
        item_cobertura: "Máximo: 2.500",
      },
      {
        id: "CT28",
        criterio: "CA11",
        tipo: "limite",
        dado: "um CSV válido com 2.501 marcas",
        quando: "o administrador faz o upload",
        entao: "[a preencher: o arquivo inteiro é recusado com a mensagem X, ou só as 2.500 primeiras linhas são processadas]",
        tecnica: "Valor limite (4.2.2)",
        item_cobertura: "Máximo+1: 2.501",
      },
      {
        id: "CT29",
        criterio: "CA13",
        tipo: "nao_funcional",
        dado: "o job semanal executou no domingo",
        quando: "passam os dias até o domingo seguinte",
        entao: "o job não executa de novo antes do próximo horário agendado [a preencher: dia e hora]",
        tecnica: "Baseada em experiência (4.4)",
        item_cobertura: "Frequência de 1 vez por semana",
      },
      {
        id: "CT30",
        criterio: "CA13",
        tipo: "nao_funcional",
        dado: "a API da Wake fora do ar",
        quando: "o job semanal executa",
        entao: "[a preencher: o job registra a falha e segue para VTEX e OCC, ou para inteiro?]",
        tecnica: "Baseada em experiência (4.4)",
        item_cobertura: "Impacto de falha de um canal no job",
      },
      {
        id: "CT31",
        criterio: "CA11",
        tipo: "nao_funcional",
        dado: "um CSV válido com 2.500 marcas",
        quando: "o administrador faz o upload",
        entao: "o processamento termina em até [a preencher]",
        tecnica: "Baseada em experiência (4.4)",
        item_cobertura: "Tempo de processamento da carga máxima",
      },
    ],
    revisao: {
      checklist: [
        { item: "Todas as seções preenchidas e numeradas (a entrada pula da seção 4 para a 6)", ok: false },
        { item: "Cada regra tem critério e cada critério tem caso feliz", ok: true },
        { item: "Cada limite numérico tem caso de máximo e máximo+1", ok: true },
        { item: "Todo comportamento tem mensagem com texto exato", ok: false },
        { item: "Nenhuma palavra que não dá para testar", ok: false },
        { item: "Nomes consistentes", ok: false },
        { item: "Tamanho adequado (INVEST)", ok: false },
      ],
      duvidas: [
        {
          trecho:
            "criam a marca com o status \"Aguardando Criação\" (Critérios de Aceite) × criar a marca banco com o status \"Pendente\" (seção 3)",
          pergunta:
            "\"Aguardando Criação\" e \"Pendente\" são o mesmo status com dois nomes? O filtro de status lista só \"Pendente\". Qual nome vale?",
        },
        {
          trecho: "Vínculo Inteligente e Normalização (Case Sensitive)",
          pergunta:
            "O título diz \"Case Sensitive\", mas a regra aplica LOWER(), que ignora maiúsculas e minúsculas (case insensitive). Confirma que a comparação ignora maiúsculas e que o título deve ser corrigido?",
        },
        {
          trecho: "limitado a 2500 marcas por carga",
          pergunta:
            "Nenhum critério nem caso de teste da entrada cobre esse limite. Com 2.501 marcas, o arquivo inteiro é recusado ou só as 2.500 primeiras são processadas? Qual o texto da mensagem (CT28)?",
        },
        {
          trecho: "processando criações e inativações em lote perfeitamente",
          pergunta:
            "\"Perfeitamente\" não dá para testar. Qual o resultado esperado: todas as linhas válidas aplicadas, relatório de erros por linha? E a ação \"ativar\", que está nas colunas, também precisa de critério?",
        },
        {
          trecho: "4. Especificações de Interface e Ações (UI/UX) … 6. Regras de Negócio e Tratamento de \"Brechas\"",
          pergunta: "A seção 5 está faltando. Foi removida de propósito ou faltou conteúdo (por exemplo, escopo e impacto)?",
        },
        {
          trecho: "Ele identifica a similaridade gráfica, unifica os registros sob o mesmo ID interno",
          pergunta:
            "LOWER() só iguala nomes que diferem em maiúsculas. \"Similaridade gráfica\" inclui acentos, espaços ou grafias parecidas (\"Reebok\" e \"Rebok\")? Qual a regra exata (CT26)?",
        },
        {
          trecho: "Ações Individuais disponíveis para marcas em análise",
          pergunta:
            "\"Em análise\" é o status Pendente? [Criar] e [Rejeitar] também aparecem para marcas em Erro ou Rejeitado?",
        },
        {
          trecho: "[Tentar novamente]: … Reexecuta a chamada de API de sincronização com o canal.",
          pergunta: "Se a nova tentativa der certo, a marca vai para qual status? E se falhar de novo?",
        },
        {
          trecho: "movendo-a para o status correspondente e travando os produtos vinculados",
          pergunta:
            "O que significa \"travar\" os produtos: ficam inativos, ocultos ou bloqueados para edição? Uma marca Rejeitado pode voltar para Pendente?",
        },
        {
          trecho: "insere a marca diretamente como \"Ativo\" ou no fluxo de homologação configurado",
          pergunta: "Onde se configura o fluxo de homologação e qual é o padrão? Quando a marca vai direto para Ativo?",
        },
        {
          trecho: "o sistema deve espelhar essa marca localmente no Portal do Seller",
          pergunta: "Com qual status e qual Origem a marca trazida pelo job semanal é criada?",
        },
        {
          trecho: "preferencialmente nas madrugadas de domingo",
          pergunta: "\"Preferencialmente\" não dá para testar. Qual o dia e o horário exatos do Cron (CT29)?",
        },
        {
          trecho: "Antes de confirmar a inativação, um modal na tela deve exibir",
          pergunta:
            "Na inativação pela planilha não há modal: a planilha inativa direto ou pede confirmação? Quais os textos dos botões do modal?",
        },
        {
          trecho: "O erro \"Marca inexistente ou inativa\" fica extinto na entrada para novos produtos",
          pergunta:
            "Um produto novo com marca existente e Inativo é salvo? Ele fica publicado, já que produtos de marca Inativo não são publicados?",
        },
        {
          trecho: "a listagem de marcas deve exibir de forma clara os status e as origens",
          pergunta: "\"De forma clara\" não dá para testar. O protótipo define como cada status aparece (cor, rótulo)?",
        },
        {
          trecho: "Implementar a nova Fila de Auto-Remediação e Gestão de Marcas Bidirecional",
          pergunta:
            "A issue junta ingestão, ciclo de vida, conciliação, importação em massa, job semanal e inativação em cascata. Sugestão de divisão: (1) ingestão sem bloqueio e status de entrada; (2) Gestão de Marcas e ações; (3) importação CSV; (4) job semanal e vínculo; (5) inativação em cascata. Pode dividir?",
        },
        {
          trecho: "(mensagens de importação e de erro não informadas)",
          pergunta: "Quais os textos exatos das mensagens de sucesso e de erro da importação?",
        },
        { trecho: "(prioridade não informada)", pergunta: "Qual a prioridade desta issue?" },
      ],
    },
  },
};
