categoria: Segurança
pr: 52
roadmap: 43
decisao: subchaves por HKDF-SHA256 a partir do `SEGREDO_SESSAO`, uma por uso (`sso-estado` agora, `mfa` para o item 41); como a sessão de login já fica no banco, a troca não derruba nenhuma sessão
---
- **Subchaves por HKDF:** o `SEGREDO_SESSAO` não é mais usado direto; dele saem subchaves
  independentes por uso (HKDF-SHA256), começando pela que assina o estado do login único (SSO). As
  sessões de login não são afetadas; só um login único que estiver em andamento no momento da
  atualização precisa recomeçar.
