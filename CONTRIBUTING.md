# Como contribuir

## Rodar local

```bash
git clone --recurse-submodules https://github.com/DEVJS2005/issue-doc-generator.git
cd issue-doc-generator
npm install
cp .env.example .env   # uma chave de IA e o SEGREDO_SESSAO
npm run dev            # servidor (3000) e tela (5173)
```

Node 22.13 ou mais novo. Detalhes na seção "Rodar local" do README.

## Antes de abrir o PR

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e   # se mexeu na tela ou nas rotas (na 1ª vez: npx playwright install chromium)
```

- O título do PR segue o [Conventional Commits](https://www.conventionalcommits.org/pt-br/), por
  exemplo `feat: ...`, `fix(admin): ...` ou `docs: ...`. O CI confere.
- A `main` só aceita PR com o CI verde e a branch atualizada.
- Atualize o README, o `docs/ROADMAP.md` e o `CHANGELOG.md` (seção "Não lançado") quando for o caso.
- Nada de chaves, senhas ou dados pessoais reais no código, nos testes ou nos logs. Os testes usam
  dados fictícios (`@exemplo.dev`) e uma IA falsa.
- Mudança no banco: acrescente uma migração no fim de `MIGRACOES` (`server/src/banco/banco.ts`);
  nunca edite uma migração já publicada.

## Estilo

- Código, comentários, mensagens e documentação em português do Brasil.
- Textos da tela curtos e diretos; o erro diz o que fazer.
- Prefira testes que mostram o comportamento (o que a pessoa vê ou recebe) a testes de detalhe
  interno.

## Licença

Ao contribuir, você concorda que o seu código seja publicado sob a
[GNU AGPL-3.0-or-later](LICENSE), como o resto do projeto.

## Segurança

Vulnerabilidades: veja o [SECURITY.md](SECURITY.md). Não abra issue pública.
