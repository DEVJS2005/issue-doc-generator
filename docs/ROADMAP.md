# Roadmap

Atualizado em 15/11/2026. As estimativas são de tempo de implementação com testes, sem contar a
revisão.

## Onde estamos

Etapas 1 a 7 da especificação entregues na `main` (PRs #1 e #2) e correções no PR #3:

- geração e Refinar com streaming, cache de prompt, erros amigáveis e 4 provedores
  (Claude, OpenAI, compatível com OpenAI, Gemini);
- tela com login, destaques, Copiar e Baixar;
- login por adaptador, limite por hora, custo estimado no log;
- 97 testes Vitest e 7 testes Playwright (com IA falsa).

Testado com IA real (Gemini `gemini-3.8-flash`): geração de 3 linhas, exemplo de Marcas (5/5
problemas apontados), Refinar (mudou só o pedido) e cache de prompt (2ª chamada leu 20.931 tokens).

## Pendências conhecidas

| Pendência | Situação |
|---|---|
| `docker build` / `docker run` | **Não verificados**: não há Docker na máquina de desenvolvimento. O item 1 resolve. |
| Custo real com a Claude | Só estimado (~US$ 0,20 na 1ª chamada, ~US$ 0,10 depois). A conta de teste estava sem crédito. |
| Gemini sob alta demanda | Respostas 503 e gerações de 150 a 260 s. Já tem 3 tentativas automáticas; o item 5 acrescenta um modelo reserva. |
| Limite de uso em memória | Zera no reinício e não é compartilhado entre instâncias. Rodar **uma instância só**. |

## Próximos itens

| # | Item | Estimativa | Depende de |
|---|---|---|---|
| 1 | **CI no GitHub Actions**: `npm test`, `npm run test:e2e`, typecheck, `docker build`, subir o container e chamar `/api/saude` | ~40 min | — |
| 2 | **Campo Produto vira só "Nome do produto"** (texto livre, sem lista; `PRODUTOS` deixa de ser usado) | ~15 min | — |
| 3 | **Tela de administração** (provedor, modelo, esforço, limite por hora, tempo limite) | ~2 h | decisões abaixo |
| 4 | Lista de modelos da chave, buscada na API do provedor | ~45 min | 3 |
| 5 | Modelo reserva automático quando o principal der 503/sobrecarga | ~45 min | 3 |
| 6 | Painel de uso (gerações, tokens, custo, erros recentes) | 1h30 a 2h | 3 |
| 7 | Medir o custo real com a Claude e atualizar o README | ~15 min | crédito na conta |
| 8 | Dividir o JavaScript da tela (aviso de 579 KB) | ~20 min | — |
| 9 | Limite de uso compartilhado (Redis), só se houver mais de uma instância | ~1 h | decisão do DevOps |

Ordem sugerida para amanhã: **1 → 2 → 3 → 4 → 5**. O 6 em diante, conforme a prioridade.

### Tela de administração: proposta

- **Muda pela tela:** provedor, modelo, esforço, limite por hora e tempo limite. Vale para todos os
  usuários e sem reiniciar o servidor.
- **Fica no `.env`:** chaves de API (cadastre uma vez as de todos os provedores que quiser usar),
  porta, `SEGREDO_SESSAO`, usuários.
- A tela mostra quais provedores têm chave ("configurada" ou "sem chave") e só deixa escolher esses.

**Decisões em aberto** (propostas; confirmar antes de começar):

1. Quem administra: uma variável `ADMINS` no `.env` com os e-mails (proposta) ou todo usuário logado.
2. Onde gravar: `data/configuracao.json`, que sobrescreve o `.env` (proposta; no Docker vira um
   volume) ou SQLite.
3. Itens 4, 5 e 6 entram junto com o 3 ou depois.

## Para o DevOps

Detalhes em "Subir num servidor", no README. Em resumo:

- Imagem: `docker build -t issue-doc-generator .` e `docker run --env-file .env -p 3000:3000`.
  Health check: `GET /api/saude`.
- `.env` mínimo:
  - `PROVEDOR`, `MODELO` e a chave do provedor;
  - `USUARIOS_PERMITIDOS`;
  - `SEGREDO_SESSAO` (longo e aleatório);
  - `TEMPO_LIMITE_SEGUNDOS=300`.
- Proxy com HTTPS:
  - `CONFIAR_PROXY=true`;
  - `proxy_buffering off` na rota da API, porque o streaming SSE precisa disso;
  - timeout de leitura acima de `TEMPO_LIMITE_SEGUNDOS`.
- Uma instância só (o limite de uso é em memória).
- Logs em JSON no stdout, sem o texto das descrições (LGPD).
- Depois do item 3: um volume persistente para `data/`.

## Retorno dos testes de 15/11

- Refinar interrompido por **tempo esgotado** aos 180 s (Gemini lento, ajuste com ~1.900
  caracteres). Corrigido: o padrão passou a 300 s. **Quem copiou o `.env.example` antigo precisa
  trocar `TEMPO_LIMITE_SEGUNDOS=180` para `300` no próprio `.env`.**
- `npm run dev` não subia a tela no Windows (o `&` do `cmd` roda em sequência). Corrigido com
  `concurrently`: servidor e tela sobem juntos.
- "Campo Produto não é necessário, só o nome do produto": vira o item 2.
- O Refinar funciona bem para responder às dúvidas do PO em bloco (perguntas e respostas coladas
  no campo de ajuste). Quando a resposta traz um requisito novo (ex.: "quando a alocação do
  servidor mudar, mudar automaticamente o perfil"), a IA o incorpora à issue. Vale conferir se
  vira regra, critério e caso de teste.
