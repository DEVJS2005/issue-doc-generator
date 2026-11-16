# Roadmap

Atualizado em 16/11/2026. As estimativas são de tempo de implementação com testes, sem contar a
revisão.

## Onde estamos

Na `main` (PRs #1 a #3) e nos PRs #4, #5 e #6:

- geração e Refinar com streaming, cache de prompt, erros amigáveis e 4 provedores
  (Claude, OpenAI, compatível com OpenAI, Gemini);
- tela com login, destaques, Copiar e Baixar, **histórico** e **administração**;
- banco SQLite: usuários e admins (senha com hash scrypt), configuração da IA com registro de
  alterações, histórico de issues com versões e retenção;
- modelo reserva automático no 503 e lista de modelos da chave;
- CI no GitHub Actions: typecheck, Vitest, Playwright e Docker (build, container, volume, link do
  1º admin);
- painel de uso, comparação de versões, login único (SSO) e JavaScript dividido sob demanda;
- 128 testes Vitest e 11 testes Playwright (com IA falsa).

Testado com IA real (Gemini `gemini-3.8-flash`): geração de 3 linhas, exemplo de Marcas (5/5
problemas apontados), Refinar (mudou só o pedido) e cache de prompt (2ª chamada leu 20.931 tokens).

## Pendências conhecidas

| Pendência | Situação |
|---|---|
| Custo real com a Claude | Só estimado (~US$ 0,20 na 1ª chamada, ~US$ 0,10 depois). A conta de teste estava sem crédito. |
| Uma instância só | O banco é um arquivo SQLite local e o limite por hora fica em memória. Para mais de uma instância, ver item 9. |
| Aviso do `node:sqlite` | O Node imprime `ExperimentalWarning` ao subir. É só um aviso. |

## Itens

| # | Item | Estado / estimativa |
|---|---|---|
| 1 | CI no GitHub Actions (testes, e2e, Docker) | ✅ PR #4 |
| 2 | Campo "Nome do produto" (texto livre, lembrado no navegador) | ✅ PR #4 |
| 3 | Tela de administração: provedor, modelo, esforço, limites, retenção, sem reiniciar | ✅ PR #5 |
| 3b | Banco SQLite: usuários e admins, histórico de issues, 1º admin por link no log | ✅ PR #5 |
| 4 | Lista de modelos da chave | ✅ PR #5 |
| 5 | Modelo reserva no 503/limite de taxa | ✅ PR #5 |
| 6 | Painel de uso: gerações, falhas, custo, tempo, tokens e reserva por dia, pessoa e modelo | ✅ PR #6 |
| 7 | Medir o custo real com a Claude e atualizar o README | ~15 min. **Bloqueado:** a conta da Anthropic está sem crédito. |
| 8 | Dividir o JavaScript da tela: de 579 KB para 237 KB iniciais; Markdown, Histórico, Administração e Versões sob demanda | ✅ PR #6 |
| 9 | Mais de uma instância: Postgres no lugar do SQLite e limite de uso compartilhado (Redis) | ~3 h. **Em espera:** só se o DevOps for rodar mais de uma instância; para uma, o SQLite basta. |
| 10 | Login por SSO (OpenID Connect: Entra ID, Google, Keycloak, Okta…) | ✅ PR #6. Falta um login de teste com o provedor real da empresa. |
| 11 | Comparar versões de uma issue (diferença linha a linha entre duas versões) | ✅ PR #6 |

## Para o DevOps

Detalhes em "Subir num servidor", no README. Em resumo:

- **Imagem:** `docker build -t issue-doc-generator .` e
  `docker run --env-file .env -p 3000:3000 -v issue-doc-generator-dados:/app/data issue-doc-generator`.
  `HEALTHCHECK` embutido em `GET /api/saude`.
- **`.env` mínimo:** a chave de API do provedor e `SEGREDO_SESSAO` (longo e aleatório). Nada de
  usuários nem de modelo no `.env`.
- **Primeiro acesso:** `docker logs <container> | grep configurar` mostra o link de uso único para
  criar o primeiro admin. Depois disso, tudo pela aba Administração.
- **Volume `/app/data`:** é o banco (usuários, configuração, histórico). Faça backup dele; para um
  backup consistente com o servidor rodando, use `sqlite3 ... ".backup copia.db"`.
- **Proxy com HTTPS:**
  - `CONFIAR_PROXY=true`;
  - `proxy_buffering off` na rota da API, porque o streaming SSE precisa disso;
  - timeout de leitura acima do tempo limite da Administração (padrão de 300 s).
- **Uma instância só.**
- **Logs:** JSON no stdout, sem o texto das descrições (LGPD). O histórico guarda as issues no banco
  e as apaga depois da retenção configurada (padrão de 180 dias).

## Histórico de decisões

- **15/11:**
  - gerador genérico, sem marca de empresa;
  - base ISTQB pelo submódulo istqb-ai-ready;
  - 4 provedores pelos SDKs oficiais.
- **15/11, retorno dos testes:**
  - tempo limite padrão passou para 300 s;
  - `npm run dev` passou a usar `concurrently` (no Windows a tela não subia);
  - Produto virou texto livre.
- **16/11:**
  - tudo que não é segredo nem infraestrutura saiu do `.env` e foi para o banco: configuração da
    IA, usuários e admins, histórico;
  - o 1º admin é criado por um link de uso único no log;
  - histórico: cada um vê as suas issues, o admin vê todas, com retenção configurável.
