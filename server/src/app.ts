import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { criarAutenticadorEnv, type Autenticador } from "./auth/autenticador.js";
import { Limitador } from "./auth/limite.js";
import { criarSessoes } from "./auth/sessao.js";
import type { Config } from "./config.js";
import { criarProvedor } from "./ia/index.js";
import type { Provedor } from "./ia/tipos.js";
import { TIPOS_ISSUE } from "./issue/schema.js";
import { registrarAuth } from "./rotas/auth.js";
import { LIMITE_CONTEXTO, LIMITE_DESCRICAO, registrarRotaGerar } from "./rotas/gerar.js";
import { LIMITE_AJUSTE, registrarRotaRefinar } from "./rotas/refinar.js";

const pastaWebPadrao = fileURLToPath(new URL("../../web/dist", import.meta.url));

export type OpcoesApp = {
  pastaWeb?: string;
  /** Provedor de IA. Se omitido, vem do .env; null simula "não configurado". Usado nos testes. */
  provedor?: Provedor | null;
  /** Login. Se omitido, usa USUARIOS_PERMITIDOS do .env. */
  autenticador?: Autenticador;
};

export async function montarApp(config: Config, opcoes: OpcoesApp = {}) {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" },
    trustProxy: config.confiarProxy,
  });
  const provedor = opcoes.provedor === undefined ? criarProvedor(config) : opcoes.provedor;
  const autenticador = opcoes.autenticador ?? criarAutenticadorEnv(config.usuariosPermitidos);
  const sessoes = criarSessoes(config.segredoSessao, config.sessaoHoras);
  if (sessoes.segredoTemporario) {
    app.log.warn("SEGREDO_SESSAO vazio: usando um segredo temporário; as sessões caem quando o servidor reinicia.");
  }

  app.get("/api/saude", async () => ({ ok: true, provedor: config.provedor, modelo: config.modelo }));

  // Login primeiro: o hook dele bloqueia (401) as rotas da IA para quem não está logado.
  registrarAuth(app, { autenticador, sessoes });

  app.get("/api/opcoes", async () => ({
    tipos: TIPOS_ISSUE,
    produtos: [...config.produtos, "Outro"],
    limites: { descricao: LIMITE_DESCRICAO, contexto: LIMITE_CONTEXTO, ajuste: LIMITE_AJUSTE },
  }));

  const opcoesGeracao = { config, provedor, limiteUso: new Limitador(config.limitePorHora, 3_600_000) };
  registrarRotaGerar(app, opcoesGeracao);
  registrarRotaRefinar(app, opcoesGeracao);

  // Em produção o servidor também entrega o build do web/.
  const pastaWeb = opcoes.pastaWeb ?? pastaWebPadrao;
  if (existsSync(path.join(pastaWeb, "index.html"))) {
    await app.register(fastifyStatic, { root: pastaWeb });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ erro: "Rota não encontrada." });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
