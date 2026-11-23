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
- **Changelog e roadmap por fragmento:** crie um arquivo em [`changelog.d/`](changelog.d/README.md)
  com a categoria, o texto do changelog e, se houver, o item do ROADMAP, o número do PR e as
  decisões. Não edite o `CHANGELOG.md`, a tabela de itens nem o histórico de decisões no PR: o
  release junta tudo (`npm run changelog -- --versao X.Y.Z`). Assim os PRs não conflitam entre si.
  Itens novos do ROADMAP entram juntos, num PR `docs:` antes de começar a fase.
- Atualize o README quando for o caso.
- Nada de chaves, senhas ou dados pessoais reais no código, nos testes ou nos logs. Os testes usam
  dados fictícios (`@exemplo.dev`) e uma IA falsa.
- Mudança no banco: acrescente uma migração no fim de `MIGRACOES` (`server/src/banco/banco.ts`);
  nunca edite uma migração já publicada.

## Fila de PRs sem trabalho manual

A `main` exige a branch atualizada. Para isso não travar a fila:

1. **Auto-merge:** em Settings → General, marque "Allow auto-merge". Em cada PR pronto, clique em
   "Enable auto-merge": ele entra sozinho quando o CI fica verde.
2. **Atualização das branches:** o workflow `atualizar-prs.yml` atualiza com a `main` os PRs abertos
   (fora de rascunho, deste repositório) a cada push na `main`. Ele precisa do segredo
   `ATUALIZAR_PRS_TOKEN`, porque o que o `GITHUB_TOKEN` faz não dispara o CI:
   - crie um *fine-grained personal access token* só para este repositório, com
     **Contents: Read and write** e **Pull requests: Read and write**, e validade curta (ex.: 90 dias);
   - guarde em Settings → Secrets and variables → Actions → New repository secret, com o nome
     `ATUALIZAR_PRS_TOKEN`;
   - sem o segredo, o workflow só avisa e não faz nada.
3. PR com conflito não é atualizado: o aviso aparece no resumo do workflow, e a correção é na branch.

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
