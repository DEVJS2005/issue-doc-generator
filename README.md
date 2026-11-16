# Issue Doc Generator

Transforma uma descrição curta ("o que está errado / o que queremos") numa **issue completa e
testável**: Problema → Solução → Requisito Técnico → Critérios de Aceite → Casos de teste → Revisão.

As técnicas de teste e de revisão seguem o **ISTQB® CTFL v4.0.1**, por meio da base
[istqb-ai-ready](https://github.com/DEVJS2005/istqb-ai-ready) (submódulo em `docs/istqb-ai-ready`).
A IA entrega um **rascunho**: o que ela não souber afirmar fica marcado como `[a preencher]` e vira
uma dúvida para o PO. Uma pessoa revisa antes de virar card.

## Como usar

1. Entre com seu e-mail e senha.
2. Escreva a **descrição** (até 4.000 caracteres), escolha o **tipo** e o **produto** e, se tiver,
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

## Estrutura

```
issue-doc-generator/
├── server/
│   ├── prompts/           sistema.md (instruções) e istqb-base.md (gerado do submódulo)
│   ├── scripts/           gerar-base-istqb.ts
│   ├── src/
│   │   ├── auth/          adaptador de login, sessão assinada, limite de uso
│   │   ├── ia/            um arquivo por provedor + erros e JSON comuns
│   │   ├── issue/         schema da issue, Markdown, coerência, partes alteradas
│   │   ├── prompt/        montagem do prompt, formatação da entrada, exemplos completos
│   │   ├── geracao/       serviço comum a todos os provedores
│   │   ├── rotas/         login, POST /api/gerar e /api/refinar (SSE)
│   │   └── custo.ts       estimativa de custo por chamada
│   └── test/              Vitest (+ servidor do teste de ponta a ponta)
├── web/                   React + Vite: login, formulário, progresso, issue, refinar
├── e2e/                   Playwright
├── docs/istqb-ai-ready/   base ISTQB (submódulo git)
├── .env.example
└── Dockerfile             imagem única: o servidor também entrega o build do web/
```

## Rodar local

Pré-requisito: Node 20 ou mais novo.

```bash
git clone --recurse-submodules https://github.com/<seu-usuario>/issue-doc-generator.git
cd issue-doc-generator
cp .env.example .env      # escolha o PROVEDOR, o MODELO e preencha a chave
npm install
npm run dev               # servidor em :3000, tela em http://localhost:5173
```

Se já clonou sem o submódulo: `git submodule update --init`.

Sem pelo menos um usuário em `USUARIOS_PERMITIDOS`, ninguém consegue entrar.

## Testes

| Comando | O que roda |
|---|---|
| `npm test` | Vitest do servidor: schema, Markdown, prompt, exemplos, rotas, login, limite, refinar, custo |
| `npm run test:e2e` | Build + Playwright: login, gerar, destaques, copiar e baixar, refinar, erro, cancelar e chave fora do navegador |
| `npm run typecheck` | TypeScript do servidor e da tela |

O teste de ponta a ponta usa o app real com um provedor de IA **falso**
(`server/test/e2e/servidor-e2e.ts`): não gasta tokens nem precisa de chave. Na primeira vez,
instale o navegador com `npx playwright install chromium`.

## Subir com Docker

```bash
docker build -t issue-doc-generator .
docker run --env-file .env -p 3000:3000 issue-doc-generator
```

A tela fica em `http://localhost:3000`.

## Subir num servidor

1. Clone com `--recurse-submodules` (ou rode `git submodule update --init`) e crie o `.env` a
   partir do `.env.example`.
2. Defina `PROVEDOR`, `MODELO` e a chave; `USUARIOS_PERMITIDOS`; e um `SEGREDO_SESSAO` longo e
   aleatório, para as sessões sobreviverem a reinícios.
3. `docker build` e `docker run --env-file .env -p 3000:3000 --restart unless-stopped …`.
4. Coloque um proxy reverso com HTTPS na frente (nginx, Traefik, Caddy) apontando para a porta 3000,
   e use `CONFIAR_PROXY=true`, para o cookie sair com `Secure` e o limite de login usar o IP real.
   Para o streaming, desligue o buffer do proxy nessa rota (no nginx, `proxy_buffering off;`; o
   servidor já envia `X-Accel-Buffering: no`) e deixe o tempo de leitura acima de
   `TEMPO_LIMITE_SEGUNDOS`.
5. Os logs saem em JSON no stdout (`docker logs`). Eles não trazem o texto da descrição, a não ser
   com `REGISTRAR_DESCRICAO=true`.

O limite por hora e as tentativas de login ficam na memória do processo: reiniciar zera as
contagens, e com mais de uma instância cada uma conta separado.

## Login e limite de uso

- O login passa por um adaptador (`server/src/auth/autenticador.ts`). O atual lê e-mail e senha de
  `USUARIOS_PERMITIDOS`. Para SSO/OAuth, implemente a interface `Autenticador`, ou troque a rota de
  login por um callback OAuth que crie a mesma sessão; o resto do servidor não muda.
- Sem login, `/api/gerar`, `/api/refinar` e `/api/opcoes` respondem **401**.
- A sessão é um cookie `HttpOnly` e `SameSite=Strict`, assinado com HMAC (`SEGREDO_SESSAO`), que
  vale `SESSAO_HORAS`.
- Cada usuário pode fazer `LIMITE_POR_HORA` gerações ou refinamentos por hora (janela deslizante).
  Acima disso, a resposta é **429** com a hora em que libera.
- Login: até 10 tentativas por IP a cada 15 minutos.
- O log de cada chamada registra usuário, data, provedor, modelo, tokens (entrada, saída, cache
  lido e gravado), custo estimado e duração.

## Provedores de IA

O provedor fica fixo no servidor (`PROVEDOR` + `MODELO` no `.env`). Todos usam o SDK oficial e o
mesmo prompt; a saída é sempre JSON validado pelo mesmo schema, e o Markdown é montado no servidor.

| `PROVEDOR` | Chave | Saída estruturada | Cache de prompt | Observações |
|---|---|---|---|---|
| `anthropic` (padrão) | `ANTHROPIC_API_KEY` | `output_config.format` (JSON schema) | `cache_control` no bloco de sistema | `ESFORCO` e fallback de recusa (`FALLBACK_RECUSA`) |
| `openai` | `OPENAI_API_KEY` | `response_format` json_schema estrito | automático (prefixo longo) | `MODELO` obrigatório |
| `openai_compativel` | `OPENAI_API_KEY` (se o servidor pedir) | `response_format` json_schema | depende do servidor | `OPENAI_BASE_URL` e `MODELO` obrigatórios; Ollama, LM Studio, OpenRouter, Groq… |
| `gemini` | `GEMINI_API_KEY` | `responseJsonSchema` | implícito | `MODELO` obrigatório; `ESFORCO` vira `thinkingLevel` |

Exemplo com Gemini:

```env
PROVEDOR=gemini
MODELO=gemini-3.8-flash
GEMINI_API_KEY=sua-chave
```

### Trocar o modelo

Mude `MODELO` (e, se for outro provedor, `PROVEDOR` e a chave) e reinicie o servidor. Só a Claude
tem modelo padrão (`claude-opus-5-5`); nos outros, `MODELO` é obrigatório e o servidor não sobe
sem ele. Para ver os modelos que uma chave do Gemini pode usar, consulte `ai.models.list()` do SDK
`@google/genai` ou o painel do Google AI Studio.

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

**Custo por issue:**

- **Claude (`claude-opus-5-5`, estimado, ainda não medido):** com os tokens acima e os preços da
  tabela interna, fica em torno de **US$ 0,20 na 1ª chamada** (gravação do cache) e
  **US$ 0,10 por issue depois**, quase tudo em tokens de saída. O raciocínio do modelo conta como
  saída e pode aumentar esse valor; o log mostra o custo real de cada chamada (`custoEstimadoUsd`).
- **Gemini e outros provedores:** o log só mostra custo com `PRECO_POR_MTOK` configurado com o
  preço vigente do modelo.

O tempo depende do modelo e do esforço. Modelos que raciocinam bastante podem passar de 60 s na
1ª chamada; a tela avisa "ainda gerando…" e permite cancelar. `ESFORCO=low` deixa mais rápido.

## Variáveis de ambiente

| Variável | Padrão | Para que serve |
|---|---|---|
| `PROVEDOR` | `anthropic` | `anthropic`, `openai`, `openai_compativel` ou `gemini`. |
| `MODELO` | `claude-opus-5-5` (só Claude) | Modelo usado na geração. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | (vazio) | Chave do provedor escolhido. Fica só no servidor. |
| `OPENAI_BASE_URL` | (vazio) | URL base do servidor compatível com a OpenAI. |
| `ESFORCO` | `medium` | Esforço do modelo (`low` a `max`): Claude e Gemini. |
| `FALLBACK_RECUSA` | `true` | Fallback de recusa do lado do servidor, só Claude. |
| `MAX_TOKENS_SAIDA` | `64000` | Limite de tokens de saída por geração. |
| `TEMPO_LIMITE_SEGUNDOS` | `180` | Tempo máximo de uma geração. |
| `LIMITE_POR_HORA` | `30` | Gerações e refinamentos por usuário por hora. |
| `USUARIOS_PERMITIDOS` | (vazio) | `email:senha` separados por vírgula. |
| `SEGREDO_SESSAO` | (vazio = temporário) | Assina o cookie de sessão. |
| `SESSAO_HORAS` | `12` | Duração da sessão. |
| `CONFIAR_PROXY` | `false` | `true` atrás de proxy reverso com HTTPS. |
| `PRECO_POR_MTOK` | (vazio) | `entrada,saida,cacheLeitura,cacheEscrita` em US$/MTok, para o custo no log. |
| `PRODUTOS` | (vazio) | Lista de produtos da tela; "Outro" é sempre incluído. |
| `PORTA` | `3000` | Porta HTTP. |
| `REGISTRAR_DESCRICAO` | `false` | Registrar o texto da descrição nos logs (LGPD). |

## Licença e atribuição

- Código: MIT (veja [LICENSE](LICENSE)).
- A base `docs/istqb-ai-ready` é um projeto independente: código MIT e conteúdo
  **CC BY-NC 4.0** (uso não comercial). Ela é derivada do **ISTQB® Certified Tester Foundation
  Level Syllabus v4.0.1**, © 2024 International Software Testing Qualifications Board (ISTQB®).
  ISTQB® é marca registrada do ISTQB. Este projeto não é afiliado ao ISTQB® nem ao BSTQB.
  Veja `docs/istqb-ai-ready/LEGAL-NOTICE.md`.
- `server/prompts/istqb-base.md` reúne só os resumos e o guia publicados pelo istqb-ai-ready
  (CC BY-NC 4.0), não o texto do syllabus.
