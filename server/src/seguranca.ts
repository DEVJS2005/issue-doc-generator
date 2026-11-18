import type { FastifyError, FastifyInstance } from "fastify";

/**
 * Política de conteúdo: só recursos da própria origem. Sem script ou estilo embutido no HTML (o tema
 * inicial vem de /tema.js), sem objetos, sem a página dentro de iframe de outro site. As imagens
 * aceitam data: e blob: (downloads gerados no navegador).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const CABECALHOS: Record<string, string> = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};

/** Cabeçalhos de segurança em todas as respostas (tela e API). Sem dependência extra. */
export function registrarCabecalhos(app: FastifyInstance) {
  // A API só aceita JSON. "text/plain" é o tipo que outro site consegue mandar sem preflight do
  // navegador; o cookie SameSite=Strict já barra isso, e assim fica barrado também aqui (415).
  app.removeContentTypeParser("text/plain");

  app.addHook("onSend", async (request, reply, corpo) => {
    for (const [nome, valor] of Object.entries(CABECALHOS)) {
      // Uma rota pode pedir algo mais restrito (ex.: no-referrer na leitura pública).
      if (!reply.hasHeader(nome)) reply.header(nome, valor);
    }
    // HSTS só faz sentido em HTTPS (atrás de proxy, com CONFIAR_PROXY=true).
    if (request.protocol === "https") reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    return corpo;
  });
}

/**
 * Erros não tratados: a tela recebe uma mensagem genérica no formato da API, nunca o texto interno
 * (de SQLite, de biblioteca, caminhos de arquivo). O detalhe vai só para o log.
 */
export function registrarErros(app: FastifyInstance) {
  app.setErrorHandler((erro: FastifyError, request, reply) => {
    const status = erro.statusCode && erro.statusCode >= 400 && erro.statusCode < 600 ? erro.statusCode : 500;
    if (status >= 500) {
      request.log.error({ evento: "erro_interno", detalhe: erro.message, stack: erro.stack }, "erro não tratado");
      return reply
        .code(status)
        .send({ erro: { codigo: "erro_interno", mensagem: "Algo deu errado no servidor. Tente de novo em instantes.", podeTentarDeNovo: true } });
    }
    // 4xx que já vem no formato da API (ex.: o limite de pedidos): passa como está.
    const pronto = (erro as FastifyError & { erro?: { codigo: string; mensagem: string } }).erro;
    if (pronto?.codigo && pronto.mensagem) return reply.code(status).send({ erro: pronto });
    // 4xx do próprio Fastify (JSON malformado, corpo grande demais, tipo de conteúdo não aceito).
    const mensagens: Record<number, string> = {
      400: "Pedido inválido.",
      413: "O pedido é grande demais.",
      415: "Tipo de conteúdo não aceito: envie JSON.",
    };
    return reply
      .code(status)
      .send({ erro: { codigo: erro.code ?? "pedido_invalido", mensagem: mensagens[status] ?? "Pedido inválido.", podeTentarDeNovo: false } });
  });
}
