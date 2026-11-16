# Changelog

Todas as mudanças relevantes deste projeto ficam aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

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

[1.0.0]: https://github.com/DEVJS2005/issue-doc-generator/releases/tag/v1.0.0
