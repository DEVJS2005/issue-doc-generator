import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { Config } from "./config.js";
import { criarProvedor } from "./ia/index.js";
import type { Provedor } from "./ia/tipos.js";
import { TIPOS_ISSUE } from "./issue/schema.js";
import { LIMITE_CONTEXTO, LIMITE_DESCRICAO, registrarRotaGerar } from "./rotas/gerar.js";

const pastaWebPadrao = fileURLToPath(new URL("../../web/dist", import.meta.url));

export type OpcoesApp = {
  pastaWeb?: string;
  /** Provedor de IA. Se omitido, vem do .env; null simula "não configurado". Usado nos testes. */
  provedor?: Provedor | null;
};

export async function montarApp(config: Config, opcoes: OpcoesApp = {}) {
  const app = Fastify({ logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" } });
  const provedor = opcoes.provedor === undefined ? criarProvedor(config) : opcoes.provedor;

  app.get("/api/saude", async () => ({ ok: true, provedor: config.provedor, modelo: config.modelo }));

  app.get("/api/opcoes", async () => ({
    tipos: TIPOS_ISSUE,
    produtos: [...config.produtos, "Outro"],
    limites: { descricao: LIMITE_DESCRICAO, contexto: LIMITE_CONTEXTO },
  }));

  registrarRotaGerar(app, { config, provedor });

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
