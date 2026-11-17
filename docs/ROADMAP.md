# Roadmap

Atualizado em 17/11/2026. As estimativas são de tempo de implementação com testes, sem contar a
revisão.

## Onde estamos

Versão 1.1.0 na `main` (PRs #1 a #16). O PR #17, com as correções do Gemini, está em revisão.

- Geração e Refinar com streaming, cache de prompt, erros amigáveis e 4 provedores
  (Claude, OpenAI, compatível com OpenAI, Gemini).
- Tela com login por nome de usuário ou e-mail, destaques, Copiar e Baixar, **histórico** e
  **administração**. Tem tema claro e escuro, diálogos e validação do próprio sistema, e rodapé
  "Construído por JSBATIS".
- Banco SQLite: usuários e admins (senha com hash scrypt), configuração da IA com registro de
  alterações, histórico de issues com versões e retenção.
- Modelo reserva automático no 503 e lista de modelos da chave.
- Comparação de versões, login único (SSO) e JavaScript dividido sob demanda.
- Instalação com `docker compose` e guia passo a passo
  ([INSTALACAO-DOCKER.md](INSTALACAO-DOCKER.md)), testada do zero no Docker local.
- No GitHub:
  - CI: título do PR, lint, typecheck, testes, audit, ponta a ponta e Docker;
  - CodeQL e Dependabot;
  - publicação da imagem no ghcr.io;
  - `main` protegida (só por PR, com os checks verdes).
- Testes: 132 no servidor e 16 na tela (Vitest), mais 14 de ponta a ponta (Playwright, com IA
  falsa).

Testado com IA real (Gemini `gemini-3.8-flash`): geração de 3 linhas, exemplo de Marcas (5/5
problemas apontados), Refinar (mudou só o pedido) e cache de prompt (2ª chamada leu 20.931 tokens).

## Pendências conhecidas

| Pendência | Situação |
|---|---|
| Consumo e custo | Não há tela no app: ver no painel do provedor. Com a Claude, a estimativa é de ~US$ 0,20 na 1ª chamada e ~US$ 0,10 depois. |
| Uma instância só | O banco é um arquivo SQLite local e o limite por hora fica em memória. Decisão: SQLite, uma instância. |
| SSO com o provedor real | Testado com um provedor simulado. Falta um login de teste com o provedor da empresa. |
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
| 6 | Painel de uso | ❌ Descartado em 16/11: o consumo é visto no painel do próprio provedor (Anthropic Console, OpenAI, Google). |
| 7 | Medir o custo real com a Claude | ❌ Descartado pelo mesmo motivo. O README traz só uma estimativa. |
| 8 | Dividir o JavaScript da tela: de 579 KB para 237 KB iniciais; Markdown, Histórico, Administração e Versões sob demanda | ✅ PR #6 |
| 9 | Postgres e Redis para várias instâncias | ❌ Descartado em 16/11: fica o SQLite, com uma instância. |
| 10 | Login por SSO (OpenID Connect: Entra ID, Google, Keycloak, Okta…) | ✅ PR #6. Falta um login de teste com o provedor real da empresa. |
| 11 | Comparar versões de uma issue (diferença linha a linha entre duas versões) | ✅ PR #6 |
| 12 | Login por nome de usuário, tema claro/escuro, diálogos do sistema, Docker Compose, CI/CD e proteção da `main` | ✅ PR #8 (v1.1.0) |
## Próximos (escolhidos em 17/11)

Sugestão de ordem: primeiro o que dá mais retorno com menos esforço. Ao todo são cerca de 40 h.

### Lote 1: amanhã (~7 h)

| # | Item | Estimativa |
|---|---|---|
| 13 | **Release v1.1.0 e imagem pronta:** criar a tag `v1.1.0` (o CD publica a imagem no ghcr.io e cria o Release) e mudar o guia para o DevOps só baixar a imagem, sem build no servidor. | ~1 h |
| 14 | **Baixar PDF da issue pronta e refinada:** botão ao lado de Copiar e Baixar `.md`, com as seções formatadas, os destaques e os metadados (produto, tipo, autor, data e versão). Também ao abrir uma issue do histórico. | ~2 h |
| 15 | **Rascunho automático:** descrição, tipo, produto e contexto salvos no navegador enquanto a pessoa digita. Nada se perde ao recarregar ou quando a sessão expira. | ~1 h |
| 16 | **Duplicar como base:** abrir uma issue do histórico como ponto de partida de uma nova. | ~1 h |
| 17 | **Busca no histórico:** texto livre e filtros por produto, tipo, autor e período. | ~2 h |

### Lote 2: fluxo do time e saída (~12 h)

| # | Item | Estimativa |
|---|---|---|
| 18 | **Status da issue:** Rascunho → Revisada → Aprovada, com quem mudou e quando, e filtro por status no histórico. | ~3 h |
| 19 | **Casos de teste em CSV:** exportar no formato de importação do TestRail, Xray ou Zephyr. | ~2 h |
| 20 | **Link de compartilhamento:** link só de leitura para quem não tem login, com validade configurável e opção de revogar. | ~3 h |
| 21 | **Backup automático do banco:** backup diário do SQLite no volume, com retenção e botão "Baixar backup" na Administração. | ~2 h |
| 22 | **Issue em outro idioma:** escolher português, inglês ou espanhol na geração. | ~2 h |

### Lote 3: qualidade, governança e integrações (~21 h)

| # | Item | Estimativa |
|---|---|---|
| 23 | **Nota de qualidade:** checklist INVEST e ISTQB com nota por seção e sugestões do que falta. | ~3 h |
| 24 | **Anexar print ou imagem** junto da descrição; a IA lê a imagem (os 4 provedores aceitam). | ~3 h |
| 25 | **Log de auditoria:** quem gerou, apagou ou mudou usuários e ajustes, com tela de consulta para o admin. | ~3 h |
| 26 | **Criar a issue direto no GitHub Issues, Jira ou Azure DevOps:** token no `.env` e projeto escolhido na tela. Começar por uma ferramenta, a que o time usa. | ~4 h cada |

Ficaram de fora nesta rodada:
- cenários em Gherkin;
- contexto fixo por produto;
- modelos de issue por time.

## Para o DevOps

Passo a passo completo em [INSTALACAO-DOCKER.md](INSTALACAO-DOCKER.md). Em resumo:

- **Subir:** `cp .env.example .env` e `docker compose up -d --build`. A imagem tem
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
- **16/11, mais tarde:**
  - fica o SQLite, com uma instância; nada de Postgres ou Redis;
  - sem tela de consumo no app, porque o consumo é visto no painel do provedor.
- **16/11, à noite:**
  - login por nome de usuário;
  - visual com tema claro e escuro;
  - diálogos do próprio sistema, no lugar das caixas do navegador;
  - `main` protegida, com CI/CD;
  - instalação limpa no Docker validada (achou 2 bugs do Gemini, corrigidos no PR #17).
- **17/11:**
  - botão de PDF entra no roadmap;
  - do brainstorm, entram os itens 13 a 26, em três lotes.
