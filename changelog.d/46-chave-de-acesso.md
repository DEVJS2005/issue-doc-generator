categoria: Segurança
pr: 57
roadmap: 46
decisao: chave de acesso (passkey, WebAuthn) com a biblioteca `@simplewebauthn` (servidor e navegador); liga só com `URL_PUBLICA`, porque a chave fica presa ao domínio e não funciona por IP
decisao: a chave pede biometria ou PIN e vale como segunda etapa: o login com ela não pede o código do aplicativo e cumpre o `ADMIN_EXIGE_MFA=true`
decisao: cadastrar e remover uma chave pedem a senha confirmada nos últimos 5 minutos; o banco guarda só a chave pública (migração 10)
---
- **Chave de acesso (passkey):** com `URL_PUBLICA`, cada pessoa cadastra em **Segurança** uma
  chave de acesso e entra sem senha, com a digital, o rosto ou o PIN do aparelho. A chave vale
  como segunda etapa, também para o admin com `ADMIN_EXIGE_MFA=true`. Cadastrar e remover pedem a
  senha de novo, e a auditoria registra as duas ações (migração 10).
