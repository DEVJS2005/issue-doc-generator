// Abre um backup criptografado (.db.enc) e grava o banco SQLite de volta, para restaurar.
//
// No container (a chave já está no ambiente):
//   docker compose exec app node server/dist/restaurar-backup.js \
//     /app/data/backups/issue-doc-generator-AAAA-MM-DD-HHmmssSSS.db.enc /app/data/restaurado.db
// Fora do container, na pasta server: npm run backup:abrir -- <arquivo.db.enc> <saida.db>
//
// A chave vem de BACKUP_CHAVE (a mesma do servidor que fez o backup). O arquivo de saída não pode
// existir: o script não sobrescreve nada.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { carregarConfig } from "./config.js";
import { abrirBackup, ErroBackup } from "./banco/backup.js";

function sair(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) sair("Uso: restaurar-backup <arquivo.db.enc> <saida.db>");
if (!existsSync(entrada)) sair(`Arquivo não encontrado: ${entrada}`);
if (existsSync(saida)) sair(`O arquivo de saída já existe: ${saida}. Escolha outro nome.`);

let chave: Buffer | null;
try {
  chave = carregarConfig().backupChave;
} catch {
  sair("BACKUP_CHAVE inválida: use 32 bytes em hex (64 caracteres) ou em base64.");
}
if (!chave) sair("Defina BACKUP_CHAVE com a mesma chave do servidor que fez o backup.");

try {
  writeFileSync(saida, abrirBackup(readFileSync(entrada), chave), { mode: 0o600, flag: "wx" });
  console.warn(`Backup aberto: ${saida}. Para restaurar, pare o servidor e troque o arquivo do banco por este.`);
} catch (e) {
  sair(e instanceof ErroBackup ? e.message : `Não foi possível abrir o backup: ${String(e)}`);
}
