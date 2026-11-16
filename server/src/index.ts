import { montarApp } from "./app.js";
import { carregarConfig } from "./config.js";

const config = carregarConfig();
const app = await montarApp(config);
await app.listen({ port: config.porta, host: "0.0.0.0" });
