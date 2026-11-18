# Changelog

Todas as mudanças relevantes deste projeto ficam aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- **Criar a issue no Jira**, direto do histórico: projeto e tipo escolhidos na tela, descrição
  completa convertida para o formato do Jira e rótulo `issue-doc-generator`. Funciona no Jira Cloud
  (e-mail e token de API) e no Data Center (token de acesso pessoal), com as credenciais só no
  servidor (`JIRA_URL`, `JIRA_EMAIL` e `JIRA_TOKEN`). Cada issue vira uma só no Jira, e o link fica
  guardado.
- **Anexar print ou imagem** à descrição (até 3, PNG, JPEG, WebP ou GIF), pelo botão "Anexar print"
  ou colando com Ctrl+V. A IA lê o que aparece na imagem (textos de tela, campos, mensagens de erro).
  Funciona nos 4 provedores. As imagens vão só para a IA nesta geração e não ficam no histórico, no
  rascunho nem no log. Prints grandes são reduzidos no navegador (até 1600 px), e o servidor confere
  se o conteúdo é mesmo do formato declarado.
- **Nota de qualidade** da issue (0 a 100): checagens INVEST e ISTQB em 5 grupos (valor, escopo,
  critérios, casos de teste e revisão), com o nível ("Pronta para o time", "Quase pronta" ou
  "Precisa de revisão") e a sugestão de cada ponto que falta. É calculada no servidor, sem chamar a
  IA de novo. Aparece ao gerar, ao refinar e ao abrir do histórico, e fica fora do PDF.
- Ao abrir uma issue do histórico, os avisos de coerência agora também aparecem.
- **Auditoria** na Administração: quem fez o quê (logins, inclusive os recusados, gerações,
  refinamentos, status, links, issues apagadas, ajustes, usuários, backups e criações no Jira), com
  data, IP e filtros. Sem senhas, tokens nem texto de issue. Segue a retenção do histórico.
- Teste semanal com IA real no GitHub Actions (`ia-real.yml`) e o script
  `npm run teste:ia-real --workspace server`. Provedores sem chave são pulados.
- Dependabot agrupa as atualizações das Actions num PR só por semana.

### Corrigido

- No celular, a aba Administração tinha rolagem horizontal na página inteira: os textos só para
  leitor de tela das tabelas escapavam da área de rolagem.


### Segurança

- Cabeçalhos de segurança em todas as respostas: CSP só com a própria origem (o script de tema saiu
  do HTML para `/tema.js`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy` e HSTS em HTTPS.
- Erros internos respondem uma mensagem genérica, sem o texto do erro nem o stack; o detalhe vai
  só para o log.
- Trocar a senha ou desativar alguém encerra as sessões abertas dessa pessoa (migração 6).
- A sessão é conferida antes de ler o corpo do pedido: sem login, a geração (que aceita até 18 MB
  com prints) é recusada sem ler o corpo.
- A API aceita só JSON (`text/plain` passa a dar 415).
- A leitura pública por link tem limite de 60 pedidos por minuto por IP.
- `docker-compose.yml`: o container roda sem capacidades do kernel e sem escalada de privilégio.

### Documentação

- `SECURITY.md` (como relatar uma vulnerabilidade) e `CONTRIBUTING.md`.
- README: seção de Segurança; Recursos, Como usar, Estrutura, Testes e "Subir num servidor"
  atualizados.
## [1.2.0] - 2026-11-17

### Adicionado

- **Status da issue:** Rascunho, Revisada ou Aprovada, com quem mudou e quando, e filtro por status
  no histórico. Refinar uma issue Revisada ou Aprovada a devolve para Rascunho.
- **Casos de teste em CSV** no formato de importação do TestRail, do Xray (Jira) ou do Zephyr Scale.
  Células que começam com `=`, `+`, `-` ou `@` ganham um apóstrofo, para a planilha não as
  executar como fórmula.
- **Link de compartilhamento** só de leitura, para quem não tem login, com validade de 1, 7 ou 30
  dias e revogação. O banco guarda só o hash do token.
- **Backup automático do banco:** um por dia, na pasta `backups` ao lado do banco (no Docker,
  dentro do volume), guardando as cópias mais novas (7 por padrão, ajustável na Administração), com
  "Fazer backup agora" e download na Administração.
- **Issue em português, inglês ou espanhol:** o idioma é escolhido no formulário; o Markdown sai
  com os títulos no mesmo idioma.
- **Baixar PDF** da issue (gerada, refinada ou aberta do histórico), pela impressão do navegador:
  sai só a issue, com as seções formatadas, os destaques e um cabeçalho com produto, tipo, autor,
  data e versão.
- **Rascunho automático:** descrição, tipo, produto e contexto ficam guardados no navegador,
  por pessoa, enquanto ela digita. Voltam depois de recarregar a página ou de a sessão expirar, e
  somem quando a issue é gerada.
- **Usar como base:** no Histórico, abre uma issue nova com a descrição, o tipo, o produto e o
  contexto de outra.
- **Busca no histórico:** texto livre (título, produto, descrição e texto da issue) e filtros por
  produto, tipo, autor (admin) e período.
- Instalação com a **imagem pronta do ghcr.io**: o `docker-compose.yml` baixa a imagem
  (`VERSAO_IMAGEM` fixa uma versão), e o guia não pede mais clone nem build no servidor. O build a
  partir do código continua possível com `docker-compose.build.yml`.

### Corrigido

- **Gemini:** a geração falhava com "configuração inválida" porque o SDK `@google/genai` 3.x
  passou a usar a API `v1` por padrão, e essa versão não aceita instrução de sistema. A versão
  agora vai fixa em `v1beta`. O Gemini 2.x recebe orçamento de raciocínio (`thinkingBudget`), já
  que só o 3 em diante aceita `thinkingLevel`. Ambos encontrados no teste de instalação limpa.
- Na Administração, o campo Modelo é obrigatório e avisa embaixo dele quando está vazio. Ao
  trocar para um provedor sem modelo padrão, a lista de modelos da chave já é buscada.
- Barra invertida nas células de tabela do Markdown da issue: agora sai escapada, sem quebrar a
  tabela.

### Alterado

- **Licença:** o código passou de MIT para **GNU AGPL-3.0-or-later**. As versões até a 1.1.0
  continuam MIT. A base ISTQB do prompt (`server/prompts/istqb-base.md`) segue CC BY-NC 4.0, sem
  uso comercial; o README explica como trocá-la por uma base própria.
- O rodapé ganhou o link "Código-fonte (AGPLv3)", como pede a seção 13 da AGPL.

## [1.1.0] - 2026-11-16

### Adicionado

- **Login por nome de usuário.** O e-mail continua aceito. Os usuários que já existiam ganham um
  nome automático, tirado da parte do e-mail antes do "@". O nome pode ser trocado na
  Administração.
- **Modo claro e modo escuro.** O tema segue o sistema por padrão e pode ser trocado no topo da
  tela. A escolha fica salva no navegador.
- Tela de entrada com uma apresentação da ferramenta.
- Rodapé fixo "Construído por JSBATIS", com link para o GitHub.
- `docker-compose.yml` e o guia [docs/INSTALACAO-DOCKER.md](docs/INSTALACAO-DOCKER.md), com a
  instalação no servidor do zero.
- Testes unitários da tela (Vitest, Testing Library) e ESLint.
- No CI: checagem do título do PR, lint e `npm audit`. Workflows novos: CodeQL, Dependabot e
  publicação da imagem no ghcr.io com Release nas tags.

### Alterado

- Visual repaginado: fontes IBM Plex servidas pela própria aplicação, cores em OKLCH, ícones e um
  favicon novos.
- O histórico mostra o nome de usuário do autor. O filtro do admin aceita nome ou e-mail.
- Confirmações e pedidos de texto (apagar issue, trocar senha, trocar nome) usam um diálogo do
  próprio sistema, no lugar das caixas do navegador. Os formulários mostram o erro embaixo do
  campo, em vez do balão do navegador.

## [1.0.0] - 2026-11-16

Primeira versão estável.

### Geração

- Issue completa e testável a partir de uma descrição curta: Problema, Solução, Requisito Técnico,
  Critérios de Aceite, Casos de teste e Revisão, com técnicas do ISTQB® CTFL v4.0.1 (base
  [istqb-ai-ready](https://github.com/DEVJS2005/istqb-ai-ready)).
- Streaming por SSE com fase e seção em andamento, Cancelar e tempo limite configurável.
- **Refinar** em linguagem natural, mostrando quais partes mudaram.
- Destaque de `[a preencher]` e das dúvidas para o PO; avisos de coerência (por exemplo, critério
  sem caso feliz).
- Copiar Markdown e Baixar `.md`; campo "Nome do produto" lembrado no navegador.

### Provedores de IA

- Claude (Anthropic), ChatGPT (OpenAI), Gemini e servidores compatíveis com a OpenAI (Ollama,
  LM Studio, OpenRouter, Groq), pelos SDKs oficiais e com saída JSON validada pelo mesmo schema.
- Cache de prompt, erros amigáveis, modelo reserva automático no 503 ou limite de taxa, lista de
  modelos da chave e fallback de recusa (Claude).

### Usuários, administração e histórico

- Banco SQLite (`node:sqlite`) com migrações automáticas.
- Login por e-mail e senha (hash scrypt) e SSO por OpenID Connect (PKCE, `state`, `nonce`).
- Primeiro admin criado por link de uso único no log.
- Administração sem reiniciar: provedor, modelo, esforço, limites, retenção, usuários e registro de
  alterações.
- Histórico de issues com versões, comparação linha a linha e retenção configurável.

### Operação

- Imagem Docker única com `HEALTHCHECK`, volume para o banco e logs JSON sem o texto das descrições
  (LGPD).
- CI no GitHub Actions: typecheck, 126 testes Vitest, 11 testes Playwright com IA falsa e teste da
  imagem Docker.
- JavaScript da tela dividido sob demanda (de 579 KB para 237 KB iniciais).

[Não lançado]: https://github.com/DEVJS2005/issue-doc-generator/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/DEVJS2005/issue-doc-generator/releases/tag/v1.2.0
[1.1.0]: https://github.com/DEVJS2005/issue-doc-generator/releases/tag/v1.1.0
[1.0.0]: https://github.com/DEVJS2005/issue-doc-generator/releases/tag/v1.0.0
