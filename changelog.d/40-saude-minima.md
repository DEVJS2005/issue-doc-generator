categoria: Segurança
roadmap: 40
decisao: `/api/saude` continua pública (HEALTHCHECK e monitoramento), mas sem login responde só `{"ok":true}`; provedor e modelo só para admin logado
---
- `/api/saude` sem login responde só `{"ok":true}`; o provedor e o modelo de IA em uso aparecem só
  para admin logado.
