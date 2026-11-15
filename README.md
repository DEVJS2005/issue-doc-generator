# Issue Doc Generator

Transforma uma descrição curta ("o que está errado / o que queremos") numa **issue completa e
testável**: Problema → Solução → Requisito Técnico → Critérios de Aceite → Casos de teste → Revisão.

As técnicas de teste e de revisão seguem o **ISTQB® CTFL v4.0.1**, por meio da base
[istqb-ai-ready](https://github.com/DEVJS2005/istqb-ai-ready) (submódulo em `docs/istqb-ai-ready`).
A IA entrega um **rascunho**: o que ela não souber afirmar fica marcado como `[a preencher]` e vira
uma dúvida para o PO. Uma pessoa revisa antes de virar card.

## Situação

| Etapa | Estado |
|---|---|
| 1. Esqueleto, `.env.example`, Dockerfile, README | pronta |
| 2. Prompt de sistema, schema JSON, Markdown, exemplos few-shot, testes | pronta |
| 3. Rota de geração com streaming, cache, erros e vários provedores | pronta (testada com Gemini real) |
| 4. Tela: entrada, saída com destaques, copiar e baixar | a fazer |
| 5. Refinar | a fazer |
| 6. Login, limite de uso e custo no log | a fazer: **por enquanto `/api/gerar` está aberta** |
| 7. Teste de ponta a ponta, medição de custo e tempo, README final | a fazer |

## Estrutura

```
issue-doc-generator/
├── server/
│   ├── prompts/           sistema.md (instruções) e istqb-base.md (gerado do submódulo)
│   ├── scripts/           gerar-base-istqb.ts
│   ├── src/
│   │   ├── ia/            um arquivo por provedor + erros e JSON comuns
│   │   ├── issue/         schema da issue, montagem do Markdown, verificação de coerência
│   │   ├── prompt/        montagem do prompt, formatação da entrada, exemplos completos
│   │   ├── geracao/       serviço comum a todos os provedores
│   │   └── rotas/         POST /api/gerar (SSE)
│   └── test/              Vitest
├── web/                   React + Vite (tela ainda é um esqueleto)
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

Testes do servidor: `npm test`. Typecheck: `npm run typecheck`.

## Subir com Docker

```bash
docker build -t issue-doc-generator .
docker run --env-file .env -p 3000:3000 issue-doc-generator
```

A tela fica em `http://localhost:3000`.

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

## Medições até agora

Entrada de teste: descrição de 3 linhas (limitar cupons a 3 por pedido), prompt de sistema com
~22,8 mil tokens.

| Provedor / modelo | Chamada | Tempo total | Tokens do cache | Saída |
|---|---|---|---|---|
| Gemini `gemini-3.8-flash` | 1ª | ~104 s | 0 | ~2,5 a 4,3 mil tokens |
| Gemini `gemini-3.8-flash` | 2ª | ~32 s | 20.931 de 22.822 | ~4,6 mil tokens |

A Claude ainda não foi medida. O custo médio por issue entra aqui na etapa 7.

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
| `LIMITE_POR_HORA` | `30` | Gerações por usuário por hora (etapa 6). |
| `USUARIOS_PERMITIDOS` | (vazio) | `email:senha` separados por vírgula (etapa 6). |
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
