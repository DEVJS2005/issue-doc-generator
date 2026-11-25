categoria: Segurança
roadmap: 38
decisao: a trava por conta mantém o limite de 10 falhas (15 min) e passa a dobrar a espera a cada falha depois de uma trava, até 60 min; o teto existe porque a trava também pode ser usada para bloquear a conta de outra pessoa
decisao: a trava fica no banco (migração 8) e vale também para contas que não existem, para a resposta não revelar quais existem
---
- **Trava de login por conta com espera progressiva:** a 10ª falha seguida trava a conta por 15
  minutos (até com a senha certa), e cada falha depois disso dobra a espera, até 60 minutos. A
  trava fica no banco (migração 8), não zera ao reiniciar, responde com `Retry-After` e aparece na
  Auditoria ("Conta travada"). O limite por IP, em memória, descarta as entradas vencidas a cada
  10 minutos.
