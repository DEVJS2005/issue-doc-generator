categoria: Segurança
pr: 55
roadmap: 41
decisao: MFA por TOTP (RFC 6238) escrito no projeto, com o QR code gerado no servidor pelo pacote `qrcode`; o segredo fica cifrado com a subchave `mfa`, e o desafio entre a senha e o código usa outra subchave (`mfa-desafio`)
decisao: com `ADMIN_EXIGE_MFA=true`, a sessão de admin sem segundo fator fica restrita às rotas de ligar o MFA; no SSO, o segundo fator é do provedor de identidade
decisao: baixar backup, criar ou promover admin, gerar códigos novos e desligar o MFA pedem a senha confirmada nos últimos 5 minutos; um admin pode desligar o MFA de quem perdeu o celular e os códigos
---
- **Verificação em duas etapas (MFA):** em **Segurança** (o antigo link "Sessões"), cada pessoa liga
  com um aplicativo autenticador, pelo QR code gerado no servidor, e recebe 10 códigos de
  recuperação. Com MFA ligado, o login pede o código depois da senha. Com `ADMIN_EXIGE_MFA=true`,
  todo admin liga antes de usar o sistema. Baixar backup, criar ou promover admin e mexer no MFA
  pedem a senha de novo. Um admin desliga o MFA de quem perdeu o celular e os códigos (migração 9).
