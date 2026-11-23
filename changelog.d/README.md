# Fragmentos do changelog

Cada PR cria um arquivo aqui em vez de editar o `CHANGELOG.md`, a tabela do `docs/ROADMAP.md` e o
histórico de decisões. Como cada PR mexe só no próprio arquivo, as branches atualizam com a `main`
sem conflito.

No release, `npm run changelog -- --versao X.Y.Z` junta tudo no `CHANGELOG.md` e no ROADMAP e
apaga os fragmentos. O CI confere o formato (`npm run changelog -- --conferir`).

## Formato

Nome do arquivo: livre, de preferência com o item ou a branch (ex.: `41-sessoes.md`).

```
categoria: Segurança
pr: 51
roadmap: 41
decisao: sessões guardadas no SQLite, só com o hash do id
---
- **Sessões revogáveis:** "Sair" encerra a sessão no servidor e há "Sair de todos os dispositivos".
```

- `categoria` (obrigatória): Adicionado, Alterado, Descontinuado, Removido, Corrigido, Segurança
  ou Documentação.
- `pr` e `roadmap` (opcionais): com os dois, o item do ROADMAP vira "✅ PR #<pr>" no release.
  O número do PR só existe depois de abri-lo: acrescente a linha `pr:` no commit seguinte.
- `decisao` (opcional, pode repetir): vira um item do histórico de decisões, com a data.
- Depois do `---`: o texto do changelog em Markdown, como vai aparecer.
