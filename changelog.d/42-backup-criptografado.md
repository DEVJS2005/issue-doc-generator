categoria: Segurança
roadmap: 42
decisao: backup criptografado opcional com `BACKUP_CHAVE` (AES-256-GCM, IV novo por arquivo, cabeçalho autenticado); sem a chave, o backup continua como antes
decisao: a restauração usa um script que já vem no container (`server/dist/restaurar-backup.js`) e nunca sobrescreve arquivo
---
- **Backup criptografado:** com `BACKUP_CHAVE` no `.env`, cada backup sai criptografado
  (AES-256-GCM, arquivo `.db.enc`). O container traz o script de restauração, e o guia do Docker
  mostra como gerar a chave, guardá-la fora do servidor e restaurar.
