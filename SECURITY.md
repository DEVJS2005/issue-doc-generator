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
- passos para reproduzir, com a versão (`/api/saude` e a página de Releases);
- se for o caso, uma sugestão de correção.

Resposta inicial em até 5 dias úteis. Depois da correção publicada, o relato pode ser divulgado,
com crédito a quem relatou, se quiser.

## Fora do escopo

- Ataques que dependem de acesso ao servidor, ao `.env` ou ao volume do banco.
- Conteúdo gerado pela IA (a issue é um rascunho que uma pessoa revisa).
- Vulnerabilidades só em dependências de desenvolvimento, que não entram na imagem de produção.

## O que o projeto já faz

O resumo das proteções está na seção [Segurança do README](README.md#segurança).

Para quem instala: use HTTPS com `CONFIAR_PROXY=true`, um `SEGREDO_SESSAO` longo e aleatório,
contas de serviço com o mínimo de permissão (Jira, provedores de IA) e copie a pasta `backups` do
volume para fora do servidor. O backup traz os usuários (senhas só como hash) e o histórico: guarde
com o mesmo cuidado do banco.
