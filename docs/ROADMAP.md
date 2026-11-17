# Roadmap

Atualizado em 17/11/2026. As estimativas são de tempo de implementação com testes, sem contar a
revisão.

## Onde estamos

Último release: **v1.1.0** (MIT), publicado em 17/11 a partir do merge do PR #8. Depois dele, a
`main` recebeu, ainda sem release: as correções do Gemini (#17), a licença AGPL (#19), o lote 1
(#20) e uma correção de tabelas no Markdown (#21). O lote 2 está no PR #22, em revisão.

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
- Licença do código: AGPL-3.0-or-later. A base ISTQB do prompt é CC BY-NC 4.0.
- Testes na `main`: Vitest no servidor e na tela, mais Playwright de ponta a ponta (com IA falsa).
  Com o PR #22: 157 no servidor, 28 na tela e 23 de ponta a ponta.

Testado com IA real (Gemini `gemini-3.8-flash`): geração de 3 linhas, exemplo de Marcas (5/5
problemas apontados), Refinar (mudou só o pedido) e cache de prompt (2ª chamada leu 20.931 tokens).

## Pendências conhecidas

| Pendência | Situação |
|---|---|
| **A imagem `latest` do ghcr.io é a v1.1.0, com o Gemini quebrado** | O guia usa `latest` por padrão, e a v1.1.0 saiu antes das correções do Gemini (#17). Quem instalar hoje com o Gemini não consegue gerar issues. Resolve com o item 27 (release v1.2.0). |
| Os testes não pegam mudança no SDK do provedor | Os testes usam IA falsa. Os 2 bugs do Gemini só apareceram na instalação limpa. Resolve com o item 29. |
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
| 12b | Correções do Gemini achadas na instalação limpa: API `v1beta` e `thinkingBudget` no 2.x | ✅ PR #17 (sem release ainda) |
| 12c | Licença AGPL-3.0-or-later e link do código-fonte no rodapé | ✅ PR #19 (sem release ainda) |
| 12d | Barra invertida nas células de tabela do Markdown | ✅ PR #21 (sem release ainda) |
## Próximos (escolhidos em 17/11)

Sugestão de ordem: primeiro o que dá mais retorno com menos esforço. Ao todo são cerca de 40 h.

### Lote 1 (~7 h)

| # | Item | Estado / estimativa |
|---|---|---|
| 13 | **Release v1.1.0 e imagem pronta:** criar a tag `v1.1.0` (o CD publica a imagem no ghcr.io e cria o Release) e mudar o guia para o DevOps só baixar a imagem, sem build no servidor. | Guia e `docker-compose.yml` com a imagem do ghcr.io: ✅. ✅ Tag `v1.1.0` criada em 17/11 (MIT, sem as correções do Gemini: veja o item 27). |
| 14 | **Baixar PDF da issue pronta e refinada:** botão ao lado de Copiar e Baixar `.md`, com as seções formatadas, os destaques e os metadados (produto, tipo, autor, data e versão). Também ao abrir uma issue do histórico. | ✅ Pela impressão do navegador ("Salvar como PDF"), sem biblioteca nova. |
| 15 | **Rascunho automático:** descrição, tipo, produto e contexto salvos no navegador enquanto a pessoa digita. Nada se perde ao recarregar ou quando a sessão expira. | ✅ |
| 16 | **Duplicar como base:** abrir uma issue do histórico como ponto de partida de uma nova. | ✅ Botão "Usar como base". |
| 17 | **Busca no histórico:** texto livre e filtros por produto, tipo, autor e período. | ✅ |

### Lote 2: fluxo do time e saída (~12 h)

| # | Item | Estado / estimativa |
|---|---|---|
| 18 | **Status da issue:** Rascunho → Revisada → Aprovada, com quem mudou e quando, e filtro por status no histórico. | ✅ Refinar uma issue Revisada ou Aprovada a devolve para Rascunho. |
| 19 | **Casos de teste em CSV:** exportar no formato de importação do TestRail, Xray ou Zephyr. | ✅ Os três, escolhidos ao baixar. |
| 20 | **Link de compartilhamento:** link só de leitura para quem não tem login, com validade configurável e opção de revogar. | ✅ Validade de 1, 7 ou 30 dias; o banco guarda só o hash do token. |
| 21 | **Backup automático do banco:** backup diário do SQLite no volume, com retenção e botão "Baixar backup" na Administração. | ✅ Pasta `backups` ao lado do banco; 7 cópias por padrão. |
| 22 | **Issue em outro idioma:** escolher português, inglês ou espanhol na geração. | ✅ Também os títulos do Markdown. |

### Lote 3: qualidade, governança e integrações (~21 h)

| # | Item | Estimativa |
|---|---|---|
| 23 | **Nota de qualidade:** checklist INVEST e ISTQB com nota por seção e sugestões do que falta. | ✅ Calculada no servidor, sem chamar a IA de novo. |
| 24 | **Anexar print ou imagem** junto da descrição; a IA lê a imagem (os 4 provedores aceitam). | ~3 h |
| 25 | **Log de auditoria:** quem gerou, apagou ou mudou usuários e ajustes, com tela de consulta para o admin. | ~3 h |
| 26 | **Criar a issue direto no GitHub Issues, Jira ou Azure DevOps:** token no `.env` e projeto escolhido na tela. Começar por uma ferramenta, a que o time usa. | ~4 h cada |

### Antes de tudo: fechar o que já está pronto (~2 h)

Encontrado na revisão de 17/11. Vem antes do lote 3.

| # | Item | Estimativa |
|---|---|---|
| 27 | **Release v1.2.0.** Revisar e mesclar o PR #22 (lote 2), subir a versão nos `package.json`, trocar "Não lançado" por `[1.2.0]` no CHANGELOG e criar a tag `v1.2.0`. O CD publica a imagem e o `latest` deixa de ter o Gemini quebrado. É o primeiro release em AGPL. Na revisão do #22, decidir se o download do backup (que traz os hashes das senhas e o histórico inteiro) fica liberado para qualquer admin. | ~1 h |
| 28 | **Instalação limpa de novo, pela imagem do ghcr.io.** Repetir o teste de 16/11 seguindo o guia atual (`docker compose pull`, sem build), já com a v1.2.0, e com geração real. Conferir também o link de compartilhamento e o backup dentro do container. | ~30 min |
| 29 | **Teste com IA real no CI.** Workflow semanal (e manual) que gera uma issue curta em cada provedor com chave guardada nos *secrets* do GitHub. Se o SDK ou a API mudar, o CI avisa antes do usuário. Fica fora dos PRs, para não gastar tokens a cada push. | ~2 h |
| 30 | **Menos PRs do Dependabot.** Agrupar as atualizações das Actions num PR só por semana (`groups` no `dependabot.yml`). Hoje vieram 8 PRs separados. | ~15 min |

Ficaram de fora nesta rodada:
- cenários em Gherkin;
- contexto fixo por produto;
- modelos de issue por time.

## Para o DevOps

Passo a passo completo em [INSTALACAO-DOCKER.md](INSTALACAO-DOCKER.md). Em resumo:

- **Subir:** `cp .env.example .env`, `docker compose pull` e `docker compose up -d` (imagem pronta do
  ghcr.io; `VERSAO_IMAGEM` fixa uma versão). A imagem tem
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
  - do brainstorm, entram os itens 13 a 26, em três lotes;
  - licença do código: AGPL-3.0-or-later; as versões até a 1.1.0 continuam MIT;
  - a base ISTQB do prompt segue CC BY-NC 4.0: o projeto como está não serve para uso comercial,
    e isso é intencional;
  - o PDF sai pela impressão do navegador, sem biblioteca nova;
  - a instalação para o DevOps passa a usar a imagem pronta do ghcr.io;
  - na revisão do fim do dia, entram os itens 27 a 30.
