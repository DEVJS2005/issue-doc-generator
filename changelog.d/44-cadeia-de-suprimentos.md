categoria: Segurança
pr: 48
roadmap: 44
decisao: Actions fixadas por SHA e imagem base com digest, atualizados pelo Dependabot; `permissions: {}` no topo de cada workflow
decisao: o Trivy roda no CI do PR (antes de publicar) e falha só em CRITICAL/HIGH com correção publicada
decisao: assinatura da imagem sem chave guardada (cosign com o OIDC do GitHub), com SBOM e proveniência do build-push-action
---
- **Cadeia de suprimentos no CI:** Actions fixadas por SHA e imagem base com digest; permissões
  mínimas por job; gitleaks em todo PR; Trivy na imagem (falha em CRITICAL/HIGH com correção);
  SBOM, proveniência e assinatura com cosign na publicação (o guia do Docker mostra como conferir);
  OpenSSF Scorecard semanal.
