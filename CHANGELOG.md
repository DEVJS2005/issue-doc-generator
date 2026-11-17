# Changelog

Todas as mudanças relevantes deste projeto ficam aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

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

### Corrigido

- **Gemini:** a geração falhava com "configuração inválida" porque o SDK `@google/genai` 3.x
  passou a usar a API `v1` por padrão, e essa versão não aceita instrução de sistema. A versão
  agora vai fixa em `v1beta`. O Gemini 2.x recebe orçamento de raciocínio (`thinkingBudget`), já
  que só o 3 em diante aceita `thinkingLevel`. Ambos encontrados no teste de instalação limpa.
- Na Administração, o campo Modelo é obrigatório e avisa embaixo dele quando está vazio. Ao
  trocar para um provedor sem modelo padrão, a lista de modelos da chave já é buscada.

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

[Não lançado]: https://github.com/DEVJS2005/issue-doc-generator/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/DEVJS2005/issue-doc-generator/releases/tag/v1.1.0
[1.0.0]: https://github.com/DEVJS2005/issue-doc-generator/releases/tag/v1.0.0
