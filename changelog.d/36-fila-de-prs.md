categoria: Documentação
roadmap: 36
decisao: changelog e roadmap por fragmento em `changelog.d/`, juntados no release; os PRs deixam de editar o `CHANGELOG.md`, a tabela de itens e o histórico de decisões
decisao: workflow `atualizar-prs.yml` atualiza as branches dos PRs com a `main`, com um token próprio (o do Actions não dispara o CI)
---
- **Fila de PRs sem conflito:** cada PR descreve a mudança num arquivo em `changelog.d/`, juntado no
  `CHANGELOG.md` e no ROADMAP pelo `npm run changelog` no release. O workflow `atualizar-prs.yml`
  atualiza com a `main` as branches dos PRs abertos (com o segredo `ATUALIZAR_PRS_TOKEN`), e o CI
  confere o formato dos fragmentos.
