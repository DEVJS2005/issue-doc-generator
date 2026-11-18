/**
 * Teste com IA real: gera uma issue curta em cada provedor que tiver chave no ambiente e confere
 * se ela passa pelo mesmo schema da aplicação. Pega mudanças de SDK ou de API que os testes com
 * IA falsa não veem (foi assim que os 2 bugs do Gemini de 16/11 apareceram).
 *
 * Uso: npm run teste:ia-real --workspace server
 * Variáveis: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY (as ausentes são puladas) e,
 * opcionalmente, MODELO_ANTHROPIC, MODELO_OPENAI, MODELO_GEMINI.
 * Sai com código 1 se algum provedor com chave falhar.
 */
import { carregarConfig, type Config } from "../src/config.js";
import { gerarIssue } from "../src/geracao/servico.js";
import { criarProvedor } from "../src/ia/index.js";
import { formatarEntrada } from "../src/prompt/entrada.js";

type Caso = { nome: Config["provedor"]; chave: string | undefined; modelo: string };

const casos: Caso[] = [
  { nome: "anthropic", chave: process.env.ANTHROPIC_API_KEY, modelo: process.env.MODELO_ANTHROPIC || "claude-haiku-5-5" },
  { nome: "openai", chave: process.env.OPENAI_API_KEY, modelo: process.env.MODELO_OPENAI || "gpt-5-mini" },
  { nome: "gemini", chave: process.env.GEMINI_API_KEY, modelo: process.env.MODELO_GEMINI || "gemini-2.5-flash" },
];

const entrada = formatarEntrada({
  descricao: "No checkout, o cliente consegue aplicar quantos cupons quiser. Queremos limitar a 3 por pedido.",
  tipo: "Melhoria",
  produto: "Loja Exemplo",
  contexto: "",
});

let falhas = 0;
for (const caso of casos) {
  if (!caso.chave) {
    console.log(`- ${caso.nome}: pulado (sem chave)`);
    continue;
  }
  const config = carregarConfig({ ...process.env, PROVEDOR: caso.nome, MODELO: caso.modelo, ESFORCO: "low" });
  const provedor = criarProvedor(config);
  if (!provedor) {
    console.log(`- ${caso.nome}: pulado (provedor não montou)`);
    continue;
  }
  const inicio = Date.now();
  try {
    const r = await gerarIssue(provedor, entrada, { signal: AbortSignal.timeout(240_000), aoProgresso: () => {} });
    const segundos = Math.round((Date.now() - inicio) / 1000);
    console.log(`- ${caso.nome} (${r.modelo}): ok em ${segundos} s, "${r.issue.titulo}", ${r.markdown.length} caracteres`);
  } catch (e) {
    falhas++;
    const erro = e as { codigo?: string; message?: string };
    console.error(`- ${caso.nome} (${caso.modelo}): FALHOU ${erro.codigo ?? ""} ${erro.message ?? String(e)}`.trim());
  }
}

if (falhas) {
  console.error(`${falhas} provedor(es) falharam.`);
  process.exit(1);
}
