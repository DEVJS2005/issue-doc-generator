categoria: Alterado
pr: 46
---
- Ao atualizar, cada pessoa precisa entrar de novo uma vez: as sessões passam a ficar no banco, e
  as do formato antigo não valem mais. O `SEGREDO_SESSAO` agora assina só o estado do login único
  (SSO); reiniciar o servidor não derruba mais as sessões.
