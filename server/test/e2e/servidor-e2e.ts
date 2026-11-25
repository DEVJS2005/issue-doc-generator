// Servidor para o teste de ponta a ponta (Playwright): o app real, com a tela compilada (web/dist)
// e um provedor de IA falso. Não chama nenhuma IA e não é usado em produção.
import { montarApp } from "../../src/app.js";
import { carregarConfig } from "../../src/config.js";
import { ErroGeracao } from "../../src/ia/erros.js";
import type { Provedor } from "../../src/ia/tipos.js";
import { criarClienteJira } from "../../src/integracoes/jira.js";
import { montarMarkdown } from "../../src/issue/markdown.js";
import { issueExemplo } from "../fixtures/issue.js";

export const PORTA_E2E = 3555;
const CHAVE_FALSA = "sk-ant-e2e-segredo-que-nao-pode-vazar";

function issueRefinada() {
  const i = issueExemplo();
  i.estados[0].status = "Disponível";
  return i;
}

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const provedor: Provedor = {
  nome: "anthropic",
  modelo: "modelo-e2e",
  async gerar({ usuario }, { signal, aoProgresso }) {
    if (usuario.includes("FALHAR")) throw new ErroGeracao("limite_taxa");
    if (usuario.includes("DEMORAR")) {
      await new Promise((_, rejeitar) => signal.addEventListener("abort", () => rejeitar(new Error("abortado"))));
    }
    const issue = usuario.includes("<ajuste>") ? issueRefinada() : issueExemplo();
    const texto = JSON.stringify(issue);
    aoProgresso({ fase: "analisando" });
    for (let i = 0; i < texto.length; i += 300) {
      await espera(15);
      aoProgresso({ fase: "escrevendo", delta: texto.slice(i, i + 300) });
    }
    return { texto, modelo: "modelo-e2e", usouFallback: false, uso: { entrada: 10, saida: 10, cacheLeitura: 0, cacheEscrita: 0 } };
  },
};

const config = carregarConfig({
  ...process.env,
  PROVEDOR: "anthropic",
  ANTHROPIC_API_KEY: CHAVE_FALSA,
  // Importados no banco em memória na subida; o primeiro vira admin.
  USUARIOS_PERMITIDOS: "qa@exemplo.dev:senha-de-teste,comum@exemplo.dev:senha-comum",
  SEGREDO_SESSAO: "segredo-e2e",
  LIMITE_POR_HORA: "100",
  PORTA: String(PORTA_E2E),
  JIRA_PROJETOS: "LOJ",
  // Chave de acesso só funciona em domínio (não em IP): o teste dela abre a tela em localhost.
  URL_PUBLICA: `http://localhost:${PORTA_E2E}`,
});

// Jira falso: um projeto, dois tipos; a criação numera LOJ-1, LOJ-2...
let numeroJira = 0;
const jiraFalso = (async (url: string, init?: RequestInit) => {
  const caminho = new URL(url).pathname;
  const responder = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  if (caminho === "/rest/api/2/project") return responder(200, [{ key: "LOJ", name: "Loja Exemplo" }]);
  if (caminho === "/rest/api/2/issue/createmeta/LOJ/issuetypes") return responder(200, { values: [{ id: "1", name: "História" }, { id: "2", name: "Bug" }] });
  if (caminho === "/rest/api/2/issue" && init?.method === "POST") return responder(201, { key: `LOJ-${++numeroJira}` });
  return responder(404, { errorMessages: ["não existe"] });
}) as typeof fetch;
const jira = criarClienteJira({ url: "https://jira.exemplo.dev", email: "", token: "falso" }, jiraFalso);

const app = await montarApp(config, { provedor, jira });

// Rota só deste servidor de teste: o Markdown esperado, para comparar com Copiar e Baixar.
app.get("/e2e/esperado", async () => ({
  gerado: montarMarkdown(issueExemplo()),
  refinado: montarMarkdown(issueRefinada()),
  chave: CHAVE_FALSA,
}));

await app.listen({ port: PORTA_E2E, host: "127.0.0.1" });
