# Issue Doc Generator

Transforma uma descrição curta ("o que está errado / o que queremos") numa **issue completa e
testável**: Problema → Solução → Requisito Técnico → Critérios de Aceite → Casos de teste → Revisão.

As técnicas de teste e de revisão seguem o **ISTQB® CTFL v4.0.1**, por meio da base
[istqb-ai-ready](https://github.com/DEVJS2005/istqb-ai-ready) (submódulo em `docs/istqb-ai-ready`).
A IA entrega um **rascunho**: o que ela não souber afirmar fica marcado como `[a preencher]` e vira
uma dúvida para o PO. Uma pessoa revisa antes de virar card.

Próximos passos, pendências conhecidas e checklist para o DevOps: [docs/ROADMAP.md](docs/ROADMAP.md).

## Como usar

1. Entre com seu e-mail e senha.
2. Escreva a **descrição** (até 4.000 caracteres), escolha o **tipo**, informe o **nome do
   produto** (a tela lembra o último usado) e, se tiver,
   cole o **contexto** (regras conhecidas, telas, links, protótipo em texto; até 8.000).
   Não cole dados pessoais reais: o texto vai para um provedor de IA.
3. Clique em **Gerar issue**. A tela mostra o que a IA está escrevendo; passados 60 s aparece
   "ainda gerando…", e **Cancelar** interrompe a qualquer momento.
4. Revise o rascunho. Cada `[a preencher]` aparece destacado em amarelo, e a seção **Dúvidas para
   o PO** fica em destaque. "Pontos para conferir" lista falhas de estrutura, como critério sem
   caso feliz.
5. **Refinar**: escreva um ajuste ("troque o status X por Y", "inclua o limite de 2.500") e a IA
   devolve a issue inteira atualizada. A tela diz quais partes mudaram, para você conferir que só
   mudou o que foi pedido.
6. **Copiar Markdown** ou **Baixar .md** entregam exatamente o texto mostrado.
7. **Histórico**: toda issue gerada fica guardada, com cada refinamento como uma nova versão.
   Cada pessoa vê, reabre (para continuar refinando) e apaga as suas; o admin vê as de todos.
8. **Administração** (só admins):
   - provedor, modelo, modelo reserva e esforço; o botão **Buscar modelos da chave** lista os
     modelos que a chave pode usar;
   - limite por hora, tempo limite e por quantos dias guardar o histórico;
   - usuários: criar, tornar admin, desativar, trocar senha;
   - registro de quem mudou o quê.

   Vale na próxima geração, sem reiniciar o servidor.

## Estrutura

```
issue-doc-generator/
├── server/
│   ├── prompts/           sistema.md (instruções) e istqb-base.md (gerado do submódulo)
│   ├── scripts/           gerar-base-istqb.ts
│   ├── src/
│   │   ├── ajustes/       configuração em uso (.env + o que a administração salvou)
│   │   ├── auth/          adaptador de login, senhas (scrypt), sessão assinada, limite de uso
│   │   ├── banco/         SQLite: migrações, usuários, configuração, histórico
│   │   ├── ia/            um arquivo por provedor, modelo reserva, lista de modelos, erros
│   │   ├── issue/         schema da issue, Markdown, coerência, partes alteradas
│   │   ├── prompt/        montagem do prompt, formatação da entrada, exemplos completos
│   │   ├── geracao/       serviço comum a todos os provedores
│   │   ├── rotas/         login e 1º admin, gerar e refinar (SSE), histórico, administração
│   │   └── custo.ts       estimativa de custo por chamada
│   └── test/              Vitest (+ servidor do teste de ponta a ponta)
├── web/                   React + Vite: login, gerar, histórico, administração
├── data/                  banco SQLite (criado na 1ª subida; fora do git)
├── e2e/                   Playwright
├── docs/istqb-ai-ready/   base ISTQB (submódulo git)
├── .env.example
└── Dockerfile             imagem única: o servidor também entrega o build do web/
```

## Rodar local

Pré-requisito: Node 22.13 ou mais novo (o banco usa o `node:sqlite` nativo).

```bash
git clone --recurse-submodules https://github.com/<seu-usuario>/issue-doc-generator.git
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
| `npm test` | Vitest do servidor: schema, Markdown, prompt, exemplos, rotas, login, 1º admin, administração, usuários, modelo reserva, histórico, retenção, limite, custo |
| `npm run test:e2e` | Build + Playwright: login, gerar, destaques, copiar e baixar, refinar, erro, cancelar, chave fora do navegador, histórico, administração e usuário sem acesso à administração |
| `npm run typecheck` | TypeScript do servidor e da tela |

O CI (`.github/workflows/ci.yml`) roda tudo isso a cada PR e push na `main`. No Docker, ele:

- faz o `docker build`;
- sobe o container só com variáveis de ambiente;
- confere a saúde, a tela, o login, o 401 sem login e o 503 sem chave de API;
- confere que o banco sobrevive a um reinício (volume);
- confere que um banco vazio mostra no log o link do primeiro admin.

O teste de ponta a ponta usa o app real com um provedor de IA **falso**
(`server/test/e2e/servidor-e2e.ts`): não gasta tokens nem precisa de chave. Na primeira vez,
instale o navegador com `npx playwright install chromium`.

## Subir com Docker

```bash
docker build -t issue-doc-generator .
docker run --env-file .env -p 3000:3000 -v issue-doc-generator-dados:/app/data issue-doc-generator
```

A tela fica em `http://localhost:3000`. O volume em `/app/data` guarda o banco (usuários,
configuração, histórico). Sem ele, os dados somem quando o container é recriado. Para pegar o
link do primeiro admin: `docker logs <container> | grep configurar`.

## Subir num servidor

1. Clone com `--recurse-submodules` (ou rode `git submodule update --init`) e crie o `.env` a
   partir do `.env.example`.
2. No `.env`: as chaves de API dos provedores que vão ser usados e um `SEGREDO_SESSAO` longo e
   aleatório, para as sessões sobreviverem a reinícios.
3. `docker build` e
   `docker run --env-file .env -p 3000:3000 -v issue-doc-generator-dados:/app/data --restart unless-stopped …`.
   A imagem tem `HEALTHCHECK` em `/api/saude`.
4. Na primeira subida, pegue no log o link `/configurar?codigo=...` e crie o primeiro admin. Na
   aba Administração, escolha provedor e modelo e cadastre os demais usuários.
5. Faça backup do volume `/app/data`: é um arquivo SQLite. Para um backup consistente com o
   servidor rodando, use `sqlite3 issue-doc-generator.db ".backup copia.db"`.
6. Coloque um proxy reverso com HTTPS na frente (nginx, Traefik, Caddy) apontando para a porta 3000,
   e use `CONFIAR_PROXY=true`, para o cookie sair com `Secure` e o limite de login usar o IP real.
   Para o streaming, desligue o buffer do proxy nessa rota (no nginx, `proxy_buffering off;`; o
   servidor já envia `X-Accel-Buffering: no`) e deixe o tempo de leitura acima de
   tempo limite configurado na Administração (padrão de 300 s).
7. Os logs saem em JSON no stdout (`docker logs`). Eles não trazem o texto da descrição, a não ser
   com `REGISTRAR_DESCRICAO=true`.

Rode **uma instância só**: o banco é um arquivo SQLite local, e o limite por hora e as tentativas
de login ficam na memória do processo (reiniciar zera as contagens).

## Usuários, administração e histórico

- **Banco:** um arquivo SQLite (`data/issue-doc-generator.db`, ou `ARQUIVO_BANCO`) guarda
  usuários, configuração da IA, o registro de alterações e o histórico de issues. As migrações
  rodam sozinhas ao subir.
- **Senhas:** guardadas só como hash scrypt com sal. Mínimo de 8 caracteres.
- **Primeiro admin:** link de uso único no log (veja "Rodar local"). Nunca fica sem administrador
  ativo: o servidor recusa tirar o último.
- **Login** por adaptador (`server/src/auth/autenticador.ts`). Para SSO/OAuth, implemente a
  interface `Autenticador`, ou troque a rota de login por um callback OAuth que crie a mesma
  sessão; o perfil de admin continua vindo do banco.
- **Sessão:** cookie `HttpOnly` e `SameSite=Strict` assinado com HMAC (`SEGREDO_SESSAO`), válido
  por `SESSAO_HORAS`. O usuário é relido do banco a cada pedido: desativar alguém ou tirar o
  admin vale na hora.
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
- O log de cada chamada registra usuário, data, provedor, modelo, tokens (entrada, saída, cache
  lido e gravado), custo estimado e duração.

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
   `resultado` (issue, Markdown e avisos) ou `erro` (código e mensagem amigável, sem stack trace).
4. Fechar a conexão cancela a chamada à IA. Passou de `TEMPO_LIMITE_SEGUNDOS`, a geração é
   interrompida com erro `tempo_esgotado`.
5. O log registra provedor, modelo, tokens (entrada, saída, cache lido e gravado) e duração.
   O texto da descrição só entra no log com `REGISTRAR_DESCRICAO=true`.

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

**Custo por issue:**

- **Claude (`claude-opus-5-5`, estimado, ainda não medido):** com os tokens acima e os preços da
  tabela interna, fica em torno de **US$ 0,20 na 1ª chamada** (gravação do cache) e
  **US$ 0,10 por issue depois**, quase tudo em tokens de saída. O raciocínio do modelo conta como
  saída e pode aumentar esse valor; o log mostra o custo real de cada chamada (`custoEstimadoUsd`).
- **Gemini e outros provedores:** o log só mostra custo com `PRECO_POR_MTOK` configurado com o
  preço vigente do modelo.

O tempo depende do modelo e do esforço. Modelos que raciocinam bastante podem passar de 60 s na
1ª chamada; a tela avisa "ainda gerando…" e permite cancelar. O esforço "Baixo" (Administração)
deixa mais rápido.

## Variáveis de ambiente

Só segredos e infraestrutura. Provedor, modelo, limites, usuários e retenção ficam na Administração.

| Variável | Padrão | Para que serve |
|---|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | (vazio) | Chaves dos provedores que podem ser escolhidos. Ficam só no servidor. |
| `OPENAI_BASE_URL` | (vazio) | URL base do servidor compatível com a OpenAI. |
| `SEGREDO_SESSAO` | (vazio = temporário) | Assina o cookie de sessão. |
| `SESSAO_HORAS` | `12` | Duração da sessão. |
| `PORTA` | `3000` | Porta HTTP. |
| `CONFIAR_PROXY` | `false` | `true` atrás de proxy reverso com HTTPS. |
| `ARQUIVO_BANCO` | `data/issue-doc-generator.db` (Docker: `/app/data/issue-doc-generator.db`) | Arquivo do banco SQLite. |
| `REGISTRAR_DESCRICAO` | `false` | Registrar o texto da descrição nos logs (LGPD). |
| `PRECO_POR_MTOK` | (vazio) | `entrada,saida,cacheLeitura,cacheEscrita` em US$/MTok, para o custo no log. |
| `FALLBACK_RECUSA` | `true` | Fallback de recusa do lado do servidor, só Claude. |
| `MAX_TOKENS_SAIDA` | `64000` | Limite de tokens de saída por geração. |

**Formato antigo (opcional):** `PROVEDOR`, `MODELO`, `ESFORCO`, `LIMITE_POR_HORA` e
`TEMPO_LIMITE_SEGUNDOS` ainda são lidos, mas só como ponto de partida enquanto a Administração
não salvar outro valor. `USUARIOS_PERMITIDOS` é importado uma vez, se o banco estiver vazio.

## Licença e atribuição

- Código: MIT (veja [LICENSE](LICENSE)).
- A base `docs/istqb-ai-ready` é um projeto independente: código MIT e conteúdo
  **CC BY-NC 4.0** (uso não comercial). Ela é derivada do **ISTQB® Certified Tester Foundation
  Level Syllabus v4.0.1**, © 2024 International Software Testing Qualifications Board (ISTQB®).
  ISTQB® é marca registrada do ISTQB. Este projeto não é afiliado ao ISTQB® nem ao BSTQB.
  Veja `docs/istqb-ai-ready/LEGAL-NOTICE.md`.
- `server/prompts/istqb-base.md` reúne só os resumos e o guia publicados pelo istqb-ai-ready
  (CC BY-NC 4.0), não o texto do syllabus.
