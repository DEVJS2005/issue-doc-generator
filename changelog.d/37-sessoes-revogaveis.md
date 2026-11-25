categoria: Segurança
roadmap: 37
decisao: sessões guardadas no banco (migração 7): o cookie leva um id aleatório de 256 bits e o banco guarda só o SHA-256 dele
decisao: as sessões do formato antigo não são aproveitadas na atualização (um cookie antigo roubado continuaria valendo sem poder ser revogado); cada pessoa entra de novo uma vez
decisao: a lista de sessões fica num diálogo aberto pelo link "Sessões" no topo
---
- **Sessões revogáveis:** a sessão fica no servidor (migração 7) e o cookie leva só um id
  aleatório; o banco guarda o hash dele, com data, último uso, IP e navegador. "Sair" encerra a
  sessão no servidor, e o link **Sessões**, no topo, lista onde a conta está conectada, com
  "Encerrar" em cada uma e "Sair de todos os dispositivos". Em HTTPS, o cookie usa o prefixo
  `__Host-`. Trocar a senha ou desativar a conta continua encerrando todas as sessões. A
  auditoria registra a saída, a sessão encerrada e o "sair de todos".
