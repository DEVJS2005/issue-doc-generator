# Issue Doc Generator: gerador de issues testáveis com IA

[![CI](https://github.com/DEVJS2005/issue-doc-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/DEVJS2005/issue-doc-generator/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/DEVJS2005/issue-doc-generator)](https://github.com/DEVJS2005/issue-doc-generator/releases)
[![Licença AGPL-3.0-or-later](https://img.shields.io/badge/licen%C3%A7a-AGPL--3.0--or--later-blue.svg)](LICENSE)
![Node 22.13+](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

Transforma uma descrição curta ("o que está errado / o que queremos") numa **issue completa e
testável**: Problema → Solução → Requisito Técnico → Critérios de Aceite → Casos de teste → Revisão.

As técnicas de teste e de revisão seguem o **ISTQB® CTFL v4.0.1**, por meio da base
[istqb-ai-ready](https://github.com/DEVJS2005/istqb-ai-ready) (submódulo em `docs/istqb-ai-ready`).
A IA entrega um **rascunho**: o que ela não souber afirmar fica marcado como `[a preencher]` e vira
uma dúvida para o PO. Uma pessoa revisa antes de virar card.

> **Licença:** o código é **AGPL-3.0-or-later**. A base ISTQB que vai no prompt
> (`server/prompts/istqb-base.md`) é **CC BY-NC 4.0**, o que proíbe o uso comercial dela. Detalhes
> em [Licença e atribuição](#licença-e-atribuição).

Próximos passos, pendências conhecidas e checklist para o DevOps: [docs/ROADMAP.md](docs/ROADMAP.md).
Mudanças por versão: [CHANGELOG.md](CHANGELOG.md).

## Recursos

- **Issue completa a partir de 3 linhas:** user story / requisito, critérios de aceite, casos de
  teste (técnicas caixa-preta do ISTQB: partição de equivalência, valor-limite, tabela de decisão,
  transição de estado) e revisão com dúvidas para o PO.
- **Vários provedores de IA:** Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google) e servidores
  compatíveis com a OpenAI (Ollama, LM Studio, OpenRouter, Groq), com saída JSON validada por schema.
- **Prints na descrição:** anexe até 3 imagens (ou cole com Ctrl+V); a IA lê textos de tela,
  campos e mensagens de erro.
- **Nota de qualidade** INVEST e ISTQB (0 a 100), com a sugestão do que falta em cada ponto.
- **Refinar** em linguagem natural, com destaque do que mudou e **comparação de versões**.
- **Saídas:** Markdown, PDF, casos de teste em CSV (TestRail, Xray, Zephyr), link de leitura sem
  login e **criação da issue no Jira** (Cloud e Data Center). Issue em português, inglês ou espanhol.
- **Histórico** por usuário, com busca, status (Rascunho, Revisada, Aprovada) e versões;
  **administração** sem reiniciar o servidor, modelo reserva automático, **auditoria** e backup
  diário do banco.
- **Login** por nome de usuário (ou e-mail) e senha, ou **SSO** (OpenID Connect: Entra ID, Google Workspace, Keycloak, Okta).
  Em **Sessões**, no topo, cada pessoa vê onde a conta está conectada, encerra o que não reconhece
  ou sai de todos os dispositivos.
- **Pronto para produção:** imagem Docker pronta no ghcr.io, SQLite, logs JSON sem dados pessoais
  (LGPD), cabeçalhos de segurança com CSP, CI com Vitest, Playwright, CodeQL e teste semanal com IA
  real. Veja [Segurança](#segurança).

## In English

**Issue Doc Generator** is an open-source, self-hosted **AI tool for product owners, QA and
developers**: it turns a short description into a complete, testable issue (user story,
acceptance criteria, test cases and review) following **ISTQB CTFL v4.0.1** test design techniques.
Works with Claude, OpenAI, Gemini and OpenAI-compatible local models. Built with Node.js,
TypeScript, React and SQLite; ships as a single Docker image. The UI and generated issues are in
Brazilian Portuguese.

## Como usar

1. Entre com seu nome de usuário (ou e-mail) e senha.
2. Escreva a **descrição** (até 4.000 caracteres), escolha o **tipo**, informe o **nome do
   produto** (a tela lembra o último usado) e, se tiver,
   cole o **contexto** (regras conhecidas, telas, links, protótipo em texto; até 8.000).
   Se ajudar, **anexe até 3 prints** (botão **Anexar print** ou Ctrl+V na descrição): a IA lê
   textos de tela, campos e mensagens de erro da imagem. As imagens vão só para a IA e não ficam
   no histórico. Não cole dados pessoais reais, nem em prints: tudo vai para um provedor de IA.
3. Clique em **Gerar issue**. A tela mostra o que a IA está escrevendo; passados 60 s aparece
   "ainda gerando…", e **Cancelar** interrompe a qualquer momento.
4. Revise o rascunho. Cada `[a preencher]` aparece destacado em amarelo, e a seção **Dúvidas para
   o PO** fica em destaque. "Pontos para conferir" lista falhas de estrutura, como critério sem
   caso feliz.
5. **Refinar**: escreva um ajuste ("troque o status X por Y", "inclua o limite de 2.500") e a IA
   devolve a issue inteira atualizada. A tela diz quais partes mudaram, para você conferir que só
   mudou o que foi pedido.
6. **Copiar Markdown**, **Baixar .md** e **Baixar PDF** entregam exatamente o texto mostrado.
   **Baixar CSV** exporta os casos de teste no formato do TestRail, do Xray ou do Zephyr Scale.
   A issue pode ser escrita em português, inglês ou espanhol (campo **Idioma da issue**).
7. **Histórico**: toda issue gerada fica guardada, com cada refinamento como uma nova versão.
   Cada pessoa vê, reabre (para continuar refinando) e apaga as suas; o admin vê as de todos.
   **Comparar versões**, abaixo da issue, mostra linha a linha o que cada refinamento mudou.
   Cada issue tem um **status** (Rascunho, Revisada, Aprovada), com quem mudou e quando, e pode
   ganhar um **link de leitura** para quem não tem login, com validade de 1, 7 ou 30 dias e
   opção de revogar.
8. **Administração** (só admins):
   - provedor, modelo, modelo reserva e esforço; o botão **Buscar modelos da chave** lista os
     modelos que a chave pode usar;
   - limite por hora, tempo limite e por quantos dias guardar o histórico;
   - usuários: criar, tornar admin, desativar, trocar senha (trocar a senha ou desativar encerra as
     sessões abertas da pessoa);
   - backup do banco (um por dia, sozinho, e "Fazer backup agora") e download;
   - **Auditoria**: quem fez o quê, com data, IP e filtros por pessoa, ação e período.

   Vale na próxima geração, sem reiniciar o servidor.

## Estrutura

```
issue-doc-generator/
├── server/
│   ├── prompts/           sistema.md (instruções) e istqb-base.md (gerado do submódulo)
│   ├── scripts/           gerar-base-istqb.ts, teste-ia-real.ts (teste semanal com IA real) e
│   │                      changelog.ts (junta changelog.d/ no CHANGELOG e no ROADMAP)
│   ├── src/
│   │   ├── ajustes/       configuração em uso (.env + o que a administração salvou)
│   │   ├── auth/          adaptador de login, regras de acesso das rotas, senhas (scrypt),
│   │   │                  cookie da sessão, selo assinado do SSO, limite de uso
│   │   ├── banco/         SQLite: migrações, usuários, configuração, histórico, links,
│   │   │                  backups, auditoria e envios ao Jira
│   │   ├── ia/            um arquivo por provedor, modelo reserva, lista de modelos, erros,
│   │   │                  validação das imagens anexadas
│   │   ├── integracoes/   Jira (cliente da API v2 e conversão do Markdown)
│   │   ├── issue/         schema da issue, Markdown, coerência, nota de qualidade, partes alteradas
│   │   ├── prompt/        montagem do prompt, formatação da entrada, exemplos completos
│   │   ├── geracao/       serviço comum a todos os provedores
│   │   ├── rotas/         login e 1º admin, SSO, gerar e refinar (SSE), histórico, links,
│   │   │                  administração e Jira
│   │   ├── auditoria.ts   registro de quem fez o quê (hook no fim de cada resposta)
│   │   ├── seguranca.ts   cabeçalhos de segurança (CSP) e tratador de erros
│   │   └── custo.ts       estimativa de custo por chamada
│   └── test/              Vitest (+ servidor do teste de ponta a ponta)
├── web/                   React + Vite: login, gerar, histórico, administração (+ test/, Vitest)
├── data/                  banco SQLite (criado na 1ª subida; fora do git)
├── e2e/                   Playwright
├── docs/                  INSTALACAO-DOCKER.md, ROADMAP.md e istqb-ai-ready/ (submódulo git)
├── changelog.d/           um fragmento do changelog por PR, juntado no release
├── .github/               CI, CodeQL, publicação no ghcr.io, teste com IA real, Dependabot
├── .env.example
├── docker-compose.yml     instalação pela imagem pronta (docker-compose.build.yml constrói do código)
└── Dockerfile             imagem única: o servidor também entrega o build do web/
```

## Rodar local

Pré-requisito: Node 22.13 ou mais novo (o banco usa o `node:sqlite` nativo).

```bash
git clone --recurse-submodules https://github.com/DEVJS2005/issue-doc-generator.git
cd issue-doc-generator
cp .env.example .env      # preencha a chave de API de pelo menos um provedor
npm install
npm run dev               # servidor em :3000, tela em http://localhost:5173
```

Se já clonou sem o submódulo: `git submodule update --init`.

**Primeiro acesso:** com o banco vazio, o servidor escreve no log um link de uso único, por exemplo
`http://localhost:3000/configurar?codigo=...`. Abra o link e crie o primeiro administrador. No
`npm run dev`, use a porta da tela: troque `3000` por `5173` no link. Depois disso, provedor,
modelo e usuários são configurados na aba **Administração**.

Quem já usava `USUARIOS_PERMITIDOS` no `.env` não precisa fazer nada: na primeira subida com o
banco vazio, esses usuários são importados (o primeiro vira admin), e a variável pode ser apagada.

O Node imprime `ExperimentalWarning: SQLite is an experimental feature` ao subir. É só um aviso: o
`node:sqlite` vem com o Node e é estável o suficiente para este uso.

## Testes

| Comando | O que roda |
|---|---|
| `npm test` | Vitest do servidor (schema, Markdown, prompt, exemplos, rotas, login, sessões revogáveis (lista, encerrar, sair de todos, cookie `__Host-`), acesso de cada rota da API, IP atrás de proxy, limite de login por IP e por conta, 1º admin, administração, usuários, modelo reserva, histórico, refinar a partir da versão guardada, status, links, backup, auditoria, nota de qualidade, imagens, Jira (projetos liberados), cabeçalhos de segurança, erros, retenção, limite, custo) e da tela (validação dos campos, diálogo do sistema, tema, rodapé, anexos, nota e auditoria) |
| `npm run test:e2e` | Build + Playwright: login, gerar, destaques, copiar e baixar, refinar, erro, cancelar, chave fora do navegador, histórico, status, CSV, link de leitura, idioma, administração, backup, auditoria, nota de qualidade, prints, Jira (falso), CSP sem bloqueios, celular sem rolagem horizontal, diálogos e validação dos campos |
| `npm run typecheck` | TypeScript do servidor e da tela |
| `npm run lint` | ESLint (TypeScript e regras dos hooks do React), sem tolerar avisos |

### Proteções no GitHub

- **CI** (`.github/workflows/ci.yml`), a cada PR e push na `main`: lint, typecheck, testes
  unitários, `npm audit` das dependências de produção, ponta a ponta e o teste da imagem Docker.
- **Título do PR** (`.github/workflows/titulo.yml`): confere o padrão Conventional Commits (por
  exemplo, `feat: ...` ou `fix(admin): ...`) ao abrir o PR e também quando o título é editado.
- **CodeQL** (`.github/workflows/codeql.yml`): análise de segurança em cada PR e uma vez por
  semana.
- **Dependabot** (`.github/dependabot.yml`): PRs semanais de atualização de npm, Actions e Docker,
  que passam pelo mesmo CI. As Actions vêm agrupadas num PR só.
- **IA real** (`.github/workflows/ia-real.yml`): toda segunda-feira (ou pelo botão "Run workflow"),
  gera uma issue curta em cada provedor com chave nos *secrets* do repositório (`ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `GEMINI_API_KEY`) e valida pelo schema. Provedores sem chave são pulados. Pega
  mudanças de SDK que os testes com IA falsa não veem. Localmente: `npm run teste:ia-real --workspace server`.
- **Publicar** (`.github/workflows/publicar.yml`): depois que o CI passa na `main`, publica
  `ghcr.io/devjs2005/issue-doc-generator:main`. Uma tag `vX.Y.Z` publica `:X.Y.Z` e `:latest` e
  cria o Release com o trecho do CHANGELOG. A tag só é aceita se bater com o `package.json` e
  tiver uma seção no CHANGELOG.
- **Atualizar PRs** (`.github/workflows/atualizar-prs.yml`): a cada push na `main`, atualiza com ela
  as branches dos PRs abertos que ficaram para trás (precisa do segredo `ATUALIZAR_PRS_TOKEN`; veja o
  [CONTRIBUTING](CONTRIBUTING.md)). Com o auto-merge ligado no PR, a fila anda sozinha.
- **Regra da `main`:** só entra por PR, com os checks acima verdes e a branch atualizada; push
  direto e force push são bloqueados.

No Docker, o CI:

- faz o `docker build`;
- sobe o container só com variáveis de ambiente;
- confere a saúde, a tela, o login, o 401 sem login e o 503 sem chave de API;
- confere que o banco sobrevive a um reinício (volume);
- confere que um banco vazio mostra no log o link do primeiro admin.

O teste de ponta a ponta usa o app real com um provedor de IA e um Jira **falsos**
(`server/test/e2e/servidor-e2e.ts`): não gasta tokens nem precisa de chave. Na primeira vez,
instale o navegador com `npx playwright install chromium`.

## Subir com Docker

```bash
cp .env.example .env   # preencha uma chave de IA e o SEGREDO_SESSAO
docker compose pull && docker compose up -d   # imagem pronta do ghcr.io
docker compose logs app | grep configurar   # link do primeiro admin
```

A tela fica em `http://localhost:3000`. O volume `issue-doc-generator-dados` guarda o banco, com
usuários, configuração e histórico. O passo a passo completo, do zero, está em
**[docs/INSTALACAO-DOCKER.md](docs/INSTALACAO-DOCKER.md)**. Ele cobre o proxy com HTTPS e
streaming, a atualização, o backup e os problemas comuns.

## Subir num servidor

O guia completo é o [docs/INSTALACAO-DOCKER.md](docs/INSTALACAO-DOCKER.md). Em resumo:

1. Baixe o `docker-compose.yml` e o `.env.example` (não precisa clonar), crie o `.env` com a
   chave de API e um `SEGREDO_SESSAO` longo e aleatório.
2. `docker compose pull && docker compose up -d`. A imagem vem pronta do ghcr.io, roda como
   usuário sem privilégio e tem `HEALTHCHECK` em `/api/saude`.
3. Pegue no log o link `/configurar?codigo=...` e crie o primeiro admin. Na Administração, escolha
   provedor e modelo e cadastre os usuários.
4. Coloque um proxy com HTTPS na frente da porta 3000, com `CONFIAR_PROXY=true`, sem buffer na rota
   da API (streaming) e com tempo de leitura acima do tempo limite da Administração. O
   `docker-compose.yml` publica a porta só em `127.0.0.1`; não deixe a 3000 aberta para a rede
   com `CONFIAR_PROXY` ligado.
5. O backup é diário e automático, dentro do volume (pasta `backups`); copie essa pasta para fora
   do servidor. Os logs saem em JSON no stdout, sem o texto das descrições.

Rode **uma instância só**: o banco é um arquivo SQLite local, e o limite por hora e as tentativas
de login ficam na memória do processo (reiniciar zera as contagens).

## Usuários, administração e histórico

- **Banco:** um arquivo SQLite (`data/issue-doc-generator.db`, ou `ARQUIVO_BANCO`) guarda
  usuários, configuração da IA, o registro de alterações e o histórico de issues. As migrações
  rodam sozinhas ao subir.
- **Senhas:** guardadas só como hash scrypt com sal. Mínimo de 8 caracteres.
- **Primeiro admin:** link de uso único no log (veja "Rodar local"). Nunca fica sem administrador
  ativo: o servidor recusa tirar o último.
- **Login** por nome de usuário (ou e-mail) e senha (`server/src/auth/autenticador.ts`) e, opcionalmente, por **SSO**
  (veja abaixo). O perfil de admin vem sempre do banco.
- **Sessão:** guardada no servidor, válida por `SESSAO_HORAS`. O cookie (`HttpOnly`,
  `SameSite=Strict`) leva um id aleatório; o banco guarda só o hash dele, com data, último uso, IP e
  navegador. "Sair" encerra a sessão no servidor, e o link **Sessões** lista as sessões abertas, com
  "Encerrar" em cada uma e "Sair de todos os dispositivos". O usuário é relido do banco a cada
  pedido: desativar alguém ou tirar o admin vale na hora.
- **Acesso:**
  - sem login, as rotas da IA, do histórico e da administração respondem **401**;
  - sem perfil de admin, `/api/admin/*` responde **403**.
- **Limite por hora** por usuário (Administração; padrão 30). Acima disso, a resposta é **429**
  com a hora em que libera.
- **Histórico:** cada geração e cada refinamento viram versões da issue. Cada pessoa vê as suas;
  o admin vê todas. Issues sem atividade há mais que a retenção configurada (padrão 180 dias) são
  apagadas sozinhas (na subida e a cada 6 horas). Como o histórico guarda a descrição, vale o aviso
  da tela: nada de dados pessoais reais.
- Login: até 10 tentativas por IP a cada 15 minutos.
- **Auditoria** (Administração → Auditoria): quem fez o quê, com data, IP e filtros por pessoa, ação
  e período. Registra logins (inclusive os recusados), gerações, refinamentos, mudança de status,
  links criados e revogados, issues apagadas, ajustes, usuários criados e alterados e backups feitos
  e baixados. Não guarda senhas, tokens, chaves nem o texto das issues. Segue a mesma retenção do
  histórico (`server/src/auditoria.ts`).
- O log de cada chamada registra usuário, data, provedor, modelo, tokens (entrada, saída, cache
  lido e gravado), custo estimado e duração.

### Login único (SSO)

OpenID Connect, que funciona com Microsoft Entra ID, Google Workspace, Keycloak, Okta e outros.
Usa Authorization Code com PKCE (S256), `state` e `nonce`, pela biblioteca `openid-client`.

1. No provedor de identidade, crie uma aplicação "web" e cadastre a URL de retorno
   `https://<seu-domínio>/api/sso/retorno`.
2. No `.env`, preencha `OIDC_EMISSOR`, `OIDC_CLIENTE_ID`, `OIDC_CLIENTE_SEGREDO` e
   `OIDC_URL_RETORNO`, igual à URL do passo 1. Opcionalmente, `OIDC_ROTULO` (texto do botão).
3. Reinicie o servidor. A tela de login ganha o botão de SSO, e o login por senha continua valendo.

Quem pode entrar:

- e-mails verificados de usuários já cadastrados e ativos no banco;
- se `OIDC_DOMINIOS_AUTOCADASTRO` tiver domínios (ex.: `empresa.com.br`), e-mails verificados desses
  domínios viram usuário comum no primeiro login. Tornar alguém admin continua sendo na
  Administração.

Se algo falhar (estado vencido, e-mail sem cadastro, usuário desativado, provedor fora do ar), a
tela de login explica o motivo.

**O que foi testado:** a URL de autorização (PKCE, `state`, `nonce`, escopo) é testada com a
biblioteca real, sem rede. O retorno (cookie de estado, cadastro, domínio, desativado, erros) é
testado com um provedor falso. A troca do código pelo token contra um provedor de verdade ainda não
foi testada: faça um login de teste ao configurar.

### Criar a issue no Jira

Com o Jira configurado, cada issue do histórico ganha o botão **Criar no Jira**. A pessoa escolhe o
projeto e o tipo (a lista vem do Jira, com as permissões da conta configurada), e a issue é criada
com o título como resumo, o texto completo na descrição (tabelas, listas e o fluxo de decisão
convertidos para o formato do Jira) e o rótulo `issue-doc-generator`. O link para a issue criada
fica guardado: cada issue do histórico vira uma só no Jira, e refinamentos depois disso não
atualizam o Jira.

- **Jira Cloud:** `JIRA_URL` (ex.: `https://empresa.atlassian.net`), `JIRA_EMAIL` e `JIRA_TOKEN`
  (token de API da conta).
- **Jira Data Center:** `JIRA_URL` e `JIRA_TOKEN` com um token de acesso pessoal (PAT), e
  `JIRA_EMAIL` vazio.
- **Projetos liberados:** `JIRA_PROJETOS` com as chaves, separadas por vírgula (ex.: `LOJ,APP`).
  A tela só mostra esses projetos, e o servidor recusa os outros. `*` libera todos os que o token
  alcança; vazio não libera nenhum (o servidor avisa no log).

As credenciais ficam só no servidor. Use uma conta de serviço com permissão de criar issues nos
projetos do time: todas as issues são criadas em nome dela. Usa a REST API v2, que existe nas duas
versões do Jira.

## Provedores de IA

Um provedor e um modelo valem para todos, escolhidos na **Administração**. As chaves ficam no
`.env`, e a tela só deixa escolher provedores com chave. Todos usam o SDK oficial e o mesmo
prompt; a saída é sempre JSON validado pelo mesmo schema, e o Markdown é montado no servidor.

| Provedor | Chave no `.env` | Saída estruturada | Cache de prompt | Observações |
|---|---|---|---|---|
| Claude (padrão) | `ANTHROPIC_API_KEY` | `output_config.format` (JSON schema) | `cache_control` no bloco de sistema | esforço e fallback de recusa (`FALLBACK_RECUSA`) |
| ChatGPT | `OPENAI_API_KEY` | `response_format` json_schema estrito | automático (prefixo longo) | modelo obrigatório |
| Compatível com OpenAI | `OPENAI_BASE_URL` (+ `OPENAI_API_KEY` se o servidor pedir) | `response_format` json_schema | depende do servidor | Ollama, LM Studio, OpenRouter, Groq… |
| Gemini | `GEMINI_API_KEY` | `responseJsonSchema` | implícito | modelo obrigatório; o esforço vira `thinkingLevel` |

### Trocar o modelo

Na Administração, escolha o provedor, clique em **Buscar modelos da chave** e escolha o modelo na
lista, ou digite o nome. Salve; vale na próxima geração. Só a Claude tem modelo padrão
(`claude-opus-5-5`).

**Modelo reserva:** se o principal responder sobrecarga (503/5xx) ou limite de taxa, a geração é
refeita no reserva, do mesmo provedor. A tela avisa quando isso acontece, e o log registra
`usouFallback`. Cancelamento e tempo esgotado não disparam a reserva.

Modelos menores seguem o schema, mas podem pular regras do prompt (por exemplo, um critério sem
caso feliz). Isso não é escondido: a tela recebe avisos de coerência junto com a issue.

### Fallback de recusa (só Claude)

Com `FALLBACK_RECUSA=true`, o servidor envia `fallbacks: "default"` com o beta
`server-side-fallback-2026-07-01`. Se o filtro de segurança do modelo recusar o pedido, a própria
API refaz a geração num modelo de fallback recomendado, na mesma chamada. Só funciona na Claude
API direta (não em Bedrock, Vertex ou Foundry); se o modelo configurado não aceitar o parâmetro,
use `FALLBACK_RECUSA=false`. O log registra `usouFallback`.

## Trocar o prompt

O prompt de sistema é montado sempre na mesma ordem, para o cache funcionar:

1. `server/prompts/sistema.md`: as instruções (papel, "nunca inventar", critérios, casos, revisão).
   Edite à vontade.
2. `server/prompts/istqb-base.md`: resumos das seções 3.2, 4.1, 4.2.x, 4.4.x e 4.5.x e o guia de
   técnicas caixa-preta, **gerado** do submódulo. Para atualizar depois de um
   `git submodule update --remote`: `npm run prompt:istqb --workspace server`.
3. `server/src/prompt/exemplos/`: os exemplos completos (entrada real → issue esperada). São
   TypeScript e passam pelos mesmos testes que a saída da IA (schema, coerência, limites).

Qualquer mudança no prompt recria o cache na próxima chamada. Não coloque data, usuário ou
qualquer valor que mude a cada pedido no prompt de sistema.

## Como a geração funciona

1. `POST /api/gerar` valida a entrada (descrição até 4.000 caracteres, contexto até 8.000).
2. O servidor monta o prompt de sistema fixo e a entrada entre tags, e chama o provedor com
   streaming.
3. A resposta volta à tela por SSE: `inicio`, `progresso` (fase e seção sendo escrita),
   `resultado` (issue, Markdown, avisos e nota de qualidade) ou `erro` (código e mensagem amigável,
   sem stack trace).
4. Fechar a conexão cancela a chamada à IA. Passou de `TEMPO_LIMITE_SEGUNDOS`, a geração é
   interrompida com erro `tempo_esgotado`.
5. O log registra provedor, modelo, tokens (entrada, saída, cache lido e gravado) e duração.
   O texto da descrição só entra no log com `REGISTRAR_DESCRICAO=true`.

**Nota de qualidade** (`server/src/issue/qualidade.ts`): de 0 a 100, com checagens INVEST e ISTQB
em 5 grupos (valor e clareza, escopo e tamanho, critérios de aceite, casos de teste e revisão). Cada
ponto que falha traz uma sugestão: termos vagos nos critérios, critério sem caso feliz, regra com
número sem caso de valor limite, técnica sem a seção do ISTQB, `[a preencher]` sem pergunta para o
PO, e assim por diante. É calculada no servidor, sem chamar a IA de novo, e não bloqueia nada.

Erros tratados: recusa, resposta cortada (`max_tokens`), limite de taxa, autenticação, conta sem
crédito, servidor instável, conexão, JSON fora do formato e tempo esgotado.

## Tempo e custo medidos

Entrada de teste: descrição de 3 linhas (limitar cupons a 3 por pedido). O prompt de sistema tem
~22,8 mil tokens, igual em todo pedido.

| Provedor / modelo | Chamada | Tempo total | Tokens do cache | Saída |
|---|---|---|---|---|
| Gemini `gemini-3.8-flash` | 1ª (grava o cache) | ~104 s | 0 | ~2,5 a 4,3 mil tokens |
| Gemini `gemini-3.8-flash` | 2ª em diante | ~32 s | 20.931 de 22.822 | ~4,6 mil tokens |
| Gemini `gemini-3.8-flash` | Exemplo de Marcas (entrada longa) | ~264 s | — | 15 critérios, 31 casos, 5/5 problemas apontados |
| Gemini `gemini-3.8-flash` | Refinar ("prioridade Alta") | ~130 s | — | mudou só Prioridade e Revisão |

Esses tempos foram medidos com o Gemini sob alta demanda (houve respostas 503 antes). Por isso o
padrão de `TEMPO_LIMITE_SEGUNDOS` é 300: com 180, um refinamento real (ajuste de ~1.900
caracteres) foi interrompido por tempo esgotado.

**Custo e consumo:** o app não tem tela de consumo. Para ver gasto e tokens, use o painel do
próprio provedor:

- Anthropic Console (Usage e Cost);
- OpenAI Platform (Usage);
- Google AI Studio ou Cloud Console (Gemini).

Para ter uma ideia com a Claude (`claude-opus-5-5`): com os tokens acima e o preço público, fica
em torno de US$ 0,20 na 1ª chamada (gravação do cache) e US$ 0,10 por issue depois. É uma
estimativa, nunca medida, porque a conta de teste estava sem crédito. O log do servidor também
traz uma estimativa por chamada (`custoEstimadoUsd`, que para provedores fora da Claude depende de
`PRECO_POR_MTOK`).

O tempo depende do modelo e do esforço. Modelos que raciocinam bastante podem passar de 60 s na
1ª chamada; a tela avisa "ainda gerando…" e permite cancelar. O esforço "Baixo" (Administração)
deixa mais rápido.

## Segurança

Resumo das proteções. Para relatar uma vulnerabilidade, veja o [SECURITY.md](SECURITY.md).

- **Senhas** com hash scrypt e sal; **sessão** guardada no servidor e revogável: o cookie
  (`HttpOnly`, `SameSite=Strict` e, em HTTPS, `Secure` com o prefixo `__Host-`) leva um id
  aleatório, e o banco guarda só o hash. "Sair" encerra a sessão no servidor; cada pessoa vê as
  próprias sessões e pode sair de todos os dispositivos. Trocar a senha ou desativar alguém encerra
  as sessões abertas dessa pessoa. Login com limite de 10 tentativas a cada 15 minutos por IP e também por conta.
  Atrás de proxy, o IP real vem só dos proxies confiáveis (`CONFIAR_PROXY`).
- **Jira:** só os projetos de `JIRA_PROJETOS`, conferidos no servidor; a URL do Jira só aparece
  para o admin.
- **Acesso:** toda rota da API exige login, menos uma lista curta de rotas públicas (saúde, login,
  configuração inicial, SSO e leitura por link); a regra vale pela rota registrada, não pelo texto
  da URL. A sessão é conferida antes de ler o corpo do pedido; cada pessoa vê só as próprias
  issues, e a administração exige perfil de admin (conferido duas vezes). As credenciais (chaves de IA, Jira, OIDC) ficam
  só no servidor.
- **Cabeçalhos** em todas as respostas: CSP só com a própria origem (sem script ou estilo embutido),
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS em HTTPS.
- **Conteúdo:** o Markdown da IA passa por `rehype-sanitize` antes de virar HTML; o CSV protege
  contra fórmulas; as imagens anexadas têm o formato conferido pelo conteúdo, não pela extensão.
  A API aceita só JSON.
- **Erros** internos respondem uma mensagem genérica; o detalhe vai só para o log, que não traz o
  texto das descrições.
- **Links de leitura:** token aleatório de 192 bits, guardado só como hash, com validade, revogação
  e limite de pedidos por IP.
- **Container:** roda como usuário sem privilégio, sem capacidades do kernel e sem escalada de
  privilégio.
- **GitHub:** CodeQL a cada PR, `npm audit` das dependências de produção no CI, Dependabot e
  `main` protegida.

## Variáveis de ambiente

Só segredos e infraestrutura. Provedor, modelo, limites, usuários e retenção ficam na Administração.

| Variável | Padrão | Para que serve |
|---|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | (vazio) | Chaves dos provedores que podem ser escolhidos. Ficam só no servidor. |
| `OPENAI_BASE_URL` | (vazio) | URL base do servidor compatível com a OpenAI. |
| `SEGREDO_SESSAO` | (vazio = temporário) | Assina o estado do login único (SSO). A sessão de login fica no banco. |
| `SESSAO_HORAS` | `12` | Duração da sessão. |
| `PORTA` | `3000` | Porta HTTP. |
| `CONFIAR_PROXY` | `false` | Proxy reverso com HTTPS na frente: `true` (1 proxy), o número de proxies ou a lista de IP/CIDR deles. |
| `ARQUIVO_BANCO` | `data/issue-doc-generator.db` (Docker: `/app/data/issue-doc-generator.db`) | Arquivo do banco SQLite. |
| `REGISTRAR_DESCRICAO` | `false` | Registrar o texto da descrição nos logs (LGPD). |
| `PRECO_POR_MTOK` | (vazio) | `entrada,saida,cacheLeitura,cacheEscrita` em US$/MTok, para o custo no log. |
| `FALLBACK_RECUSA` | `true` | Fallback de recusa do lado do servidor, só Claude. |
| `MAX_TOKENS_SAIDA` | `64000` | Limite de tokens de saída por geração. |
| `OIDC_EMISSOR` | (vazio = SSO desligado) | URL do emissor OpenID Connect. |
| `OIDC_CLIENTE_ID` / `OIDC_CLIENTE_SEGREDO` | (vazio) | Credenciais da aplicação no provedor de identidade. |
| `OIDC_URL_RETORNO` | `http://localhost:PORTA/api/sso/retorno` | URL de retorno cadastrada no provedor. |
| `OIDC_ROTULO` | `Entrar com SSO` | Texto do botão de SSO. |
| `OIDC_DOMINIOS_AUTOCADASTRO` | (vazio) | Domínios cujos e-mails viram usuário no 1º login. |
| `JIRA_URL` | (vazio) | Endereço do Jira. Vazio desliga o botão "Criar no Jira". |
| `JIRA_EMAIL` | (vazio) | E-mail da conta (Jira Cloud). Vazio no Data Center. |
| `JIRA_TOKEN` | (vazio) | Token de API (Cloud) ou token de acesso pessoal (Data Center). |
| `JIRA_PROJETOS` | (vazio = nenhum) | Chaves dos projetos liberados, separadas por vírgula; `*` libera todos. |

**Formato antigo (opcional):** `PROVEDOR`, `MODELO`, `ESFORCO`, `LIMITE_POR_HORA` e
`TEMPO_LIMITE_SEGUNDOS` ainda são lidos, mas só como ponto de partida enquanto a Administração
não salvar outro valor. `USUARIOS_PERMITIDOS` é importado uma vez, se o banco estiver vazio.

## Licença e atribuição

O projeto tem duas licenças, uma para cada parte:

| Parte | Licença | Na prática |
|---|---|---|
| Código (servidor, tela, testes, Docker) | **GNU AGPL-3.0-or-later** ([LICENSE](LICENSE)) | Pode usar, estudar, mudar e redistribuir. Quem roda uma versão **modificada** como serviço na rede precisa oferecer o código-fonte dessa versão a quem usa (seção 13). |
| Base ISTQB do prompt (`server/prompts/istqb-base.md`) e o submódulo `docs/istqb-ai-ready` | **CC BY-NC 4.0** (conteúdo) | Exige atribuição e **proíbe uso comercial**. |

**Uso comercial:** como está, o projeto não pode ser usado comercialmente, porque o prompt
carrega conteúdo CC BY-NC. Para uso comercial, troque o `server/prompts/istqb-base.md` por uma
base própria ou licenciada para isso. O código continua valendo pela AGPL.

**Seção 13 da AGPL:** o rodapé da tela tem um link para o código-fonte. Se você publicar uma
versão modificada, troque esse link (`REPOSITORIO` em `web/src/Interface.tsx`) pelo endereço do
seu código.

**Versões anteriores:** as versões até a 1.1.0 foram publicadas sob a licença MIT e continuam MIT
para quem as recebeu. A AGPL vale daqui para frente.

Atribuição da base ISTQB:

- A base `docs/istqb-ai-ready` é um projeto independente: código MIT e conteúdo
  **CC BY-NC 4.0** (uso não comercial). Ela é derivada do **ISTQB® Certified Tester Foundation
  Level Syllabus v4.0.1**, © 2024 International Software Testing Qualifications Board (ISTQB®).
  ISTQB® é marca registrada do ISTQB. Este projeto não é afiliado ao ISTQB® nem ao BSTQB.
  Veja `docs/istqb-ai-ready/LEGAL-NOTICE.md`.
- `server/prompts/istqb-base.md` reúne só os resumos e o guia publicados pelo istqb-ai-ready
  (CC BY-NC 4.0), não o texto do syllabus.
