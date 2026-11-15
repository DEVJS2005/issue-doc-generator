import { montarApp } from "./app.js";
import { carregarConfig } from "./config.js";
import { criarProvedor } from "./ia/index.js";

const config = carregarConfig();
const app = await montarApp(config);

if (!criarProvedor(config)) {
  app.log.warn(`Provedor ${config.provedor} sem chave de API: a geração de issues vai responder "não configurado".`);
} else {
  app.log.info(`IA: provedor ${config.provedor}, modelo ${config.modelo}, esforço ${config.esforco}`);
}

await app.listen({ port: config.porta, host: "0.0.0.0" });
