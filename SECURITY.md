# Política de segurança

## Versões com correção

Só a versão mais recente recebe correções de segurança. Atualize com:

```bash
docker compose pull && docker compose up -d
```

## Como relatar uma vulnerabilidade

**Não abra uma issue pública.** Use o relato privado do GitHub:
**Security → Report a vulnerability**, no repositório
[DEVJS2005/issue-doc-generator](https://github.com/DEVJS2005/issue-doc-generator/security/advisories/new).

Inclua o que for possível:

- o que acontece e o impacto (quem pode explorar e o que consegue);
- passos para reproduzir, com a versão (a tag da imagem, por exemplo `1.3.0`, ou a página de
  Releases);
- se for o caso, uma sugestão de correção.

Resposta inicial em até 5 dias úteis. Depois da correção publicada, o relato pode ser divulgado,
com crédito a quem relatou, se quiser.

## Fora do escopo

- Ataques que dependem de acesso ao servidor, ao `.env` ou ao volume do banco.
- Conteúdo gerado pela IA (a issue é um rascunho que uma pessoa revisa).
- Vulnerabilidades só em dependências de desenvolvimento, que não entram na imagem de produção.

## O que o projeto já faz

O resumo das proteções está na seção [Segurança do README](README.md#segurança).

Para quem instala (detalhes no [guia do Docker](docs/INSTALACAO-DOCKER.md)):

- Use HTTPS atrás de um proxy e diga ao servidor quem é o proxy: `CONFIAR_PROXY` com o IP ou a
  faixa dele (ex.: `127.0.0.1`). Sem proxy, deixe `false` e não exponha a porta 3000 para fora.
- Gere um `SEGREDO_SESSAO` longo e aleatório e não troque sem avisar: os segredos do MFA dependem
  dele.
- Ligue `ADMIN_EXIGE_MFA=true`, para todo admin ter uma segunda etapa (código do aplicativo ou
  chave de acesso).
- Defina `BACKUP_CHAVE` e guarde uma cópia dela fora do servidor. Copie a pasta `backups` do
  volume para fora também. Sem a chave, o backup sai aberto e traz os usuários (senhas só como
  hash) e o histórico: guarde com o mesmo cuidado do banco.
- Com `URL_PUBLICA`, as pessoas podem entrar com chave de acesso, sem senha.
- Use contas de serviço com o mínimo de permissão (Jira, provedores de IA) e limite o Jira aos
  projetos necessários (`JIRA_PROJETOS`).
- Antes de subir uma versão nova, confira a assinatura da imagem com `cosign verify` (comando no
  guia do Docker).
