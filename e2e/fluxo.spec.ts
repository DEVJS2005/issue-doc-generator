import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { codigoDoPasso, deBase32, passoEm } from "../server/src/auth/totp";

type Esperado = { gerado: string; refinado: string; chave: string };

async function esperado(page: Page): Promise<Esperado> {
  return (await page.request.get("/e2e/esperado")).json();
}

async function entrar(page: Page, email = "qa@exemplo.dev", senha = "senha-de-teste") {
  await page.goto("/");
  await page.getByLabel("Usuário ou e-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "O que está errado ou o que queremos" })).toBeVisible();
}

/** Abre "Minha conta" no topo e vai para a aba pedida. */
async function abrirConta(page: Page, aba: "Meu contexto" | "Segurança" | "Sessões") {
  await page.getByRole("button", { name: "Minha conta" }).click();
  await page.getByRole("dialog", { name: "Minha conta" }).getByRole("tab", { name: aba }).click();
}

async function gerar(page: Page, descricao: string) {
  await page.getByLabel(/^Descrição/).fill(descricao);
  await page.getByLabel("Nome do produto").fill("Loja Exemplo");
  await page.getByRole("button", { name: "Gerar issue" }).click();
}

test("sem login, a tela pede e-mail e senha e recusa senha errada", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.getByLabel("Usuário ou e-mail").fill("qa@exemplo.dev");
  await page.getByLabel("Senha").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Usuário ou senha incorretos.");
});

test("gera a issue com as seções na ordem e os destaques", async ({ page }) => {
  await entrar(page);
  await expect(page.getByRole("note")).toContainText("Não cole dados pessoais reais");
  await gerar(page, "No checkout, o cliente aplica quantos cupons quiser.\nQueremos limitar a 3 por pedido.\nNo 4º, avisar e não aplicar.");

  await expect(page.getByRole("heading", { name: "Rascunho da issue" })).toBeVisible();
  // O Markdown carrega sob demanda: espera o último título antes de ler a lista.
  await expect(page.locator(".issue h3", { hasText: "Dúvidas para o PO" })).toBeVisible();
  const titulos = await page.locator(".issue h2, .issue h3").allTextContents();
  const ordem = ["Problema", "Solução", "Requisito Técnico", "1. Contexto e Objetivo", "2. Estados / Ciclo de vida", "3. Regras de Negócio", "4. Interface", "5. Escopo e impacto", "6. Fora de escopo", "Critérios de Aceite", "Casos de teste", "Revisão da task", "Dúvidas para o PO"];
  expect(titulos).toEqual(ordem);

  expect(await page.locator(".issue mark.lacuna").count()).toBeGreaterThan(0);
  await expect(page.locator(".issue .duvidas")).toContainText("Qual o texto exato da mensagem de erro?");
});

test("Copiar Markdown e Baixar .md entregam exatamente o que está na tela", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await entrar(page);
  await gerar(page, "Limitar cupons a 3 por pedido.");
  await expect(page.getByRole("heading", { name: "Rascunho da issue" })).toBeVisible();
  const { gerado } = await esperado(page);

  await page.getByRole("button", { name: "Copiar Markdown" }).click();
  await expect(page.getByRole("button", { name: "Copiado" })).toBeVisible();
  // O clipboard do Windows troca \n por \r\n ao ler; o conteúdo tem de ser o mesmo.
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiado.replace(/\r\n/g, "\n")).toBe(gerado);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar .md" }).click()]);
  expect(download.suggestedFilename()).toBe("limitar-cupons-por-pedido.md");
  expect(await readFile((await download.path())!, "utf8")).toBe(gerado);
});

test("Refinar devolve a issue atualizada e diz o que mudou", async ({ page }) => {
  await entrar(page);
  await gerar(page, "Limitar cupons a 3 por pedido.");
  await expect(page.getByRole("heading", { name: "Rascunho da issue" })).toBeVisible();

  await page.getByLabel(/^Refinar/).fill("Troque o status Ativo por Disponível");
  await page.getByRole("button", { name: "Refinar", exact: true }).click();
  await expect(page.getByText("Mudou neste refinamento: Estados / Ciclo de vida.")).toBeVisible();
  await expect(page.locator(".issue table").nth(1)).toContainText("Disponível");
});

test("erro da IA aparece como mensagem amigável com Tentar de novo", async ({ page }) => {
  await entrar(page);
  await gerar(page, "FALHAR de propósito");
  const alerta = page.getByRole("alert");
  await expect(alerta).toContainText("O provedor de IA atingiu o limite de uso no momento.");
  await expect(alerta.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Error:|at .*\.ts/);
});

test("Nome do produto é obrigatório e a tela lembra o último usado", async ({ page }) => {
  await entrar(page);
  await page.getByLabel(/^Descrição/).fill("Limitar cupons a 3 por pedido.");
  await page.getByLabel("Nome do produto").fill("");
  await expect(page.getByRole("button", { name: "Gerar issue" })).toBeDisabled();

  await gerar(page, "Limitar cupons a 3 por pedido.");
  await expect(page.getByRole("heading", { name: "Rascunho da issue" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nome do produto")).toHaveValue("Loja Exemplo");
});

test("Cancelar interrompe a geração", async ({ page }) => {
  await entrar(page);
  await gerar(page, "DEMORAR para testar o cancelamento");
  await expect(page.getByText(/Gerando a issue/)).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Geração cancelada.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar issue" })).toBeEnabled();
});

test("a chave da API nunca chega ao navegador", async ({ page }) => {
  const { chave } = await esperado(page);
  const corpos: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/e2e/")) return;
    corpos.push(await r.text().catch(() => ""));
  });
  await entrar(page);
  await gerar(page, "Limitar cupons a 3 por pedido.");
  await expect(page.getByRole("heading", { name: "Rascunho da issue" })).toBeVisible();
  expect(corpos.length).toBeGreaterThan(3);
  for (const corpo of corpos) expect(corpo).not.toContain(chave);
  expect(await page.content()).not.toContain(chave);
});

test("o histórico guarda a issue, reabre e continua o refinamento na mesma issue", async ({ page }) => {
  await entrar(page);
  await gerar(page, "Histórico: limitar cupons a 3 por pedido.");
  await expect(page.getByText("Guardada no histórico.")).toBeVisible();

  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  const linha = page.getByRole("row", { name: /Limitar cupons por pedido/ }).first();
  await expect(linha).toContainText("Loja Exemplo");
  await linha.getByRole("button", { name: "Abrir" }).click();

  await expect(page.getByRole("heading", { name: "Rascunho da issue" })).toBeVisible();
  await expect(page.getByLabel(/^Descrição/)).toHaveValue("Histórico: limitar cupons a 3 por pedido.");
  await page.getByLabel(/^Refinar/).fill("Troque o status Ativo por Disponível");
  await page.getByRole("button", { name: "Refinar", exact: true }).click();
  await expect(page.getByText("Mudou neste refinamento: Estados / Ciclo de vida.")).toBeVisible();

  await page.getByRole("button", { name: "Comparar versões" }).click();
  await expect(page.getByText(/linha\(s\) diferente\(s\)/)).toBeVisible();
  await expect(page.locator(".diff-adicionada", { hasText: "Disponível" })).toBeVisible();
  await expect(page.getByText("Ajuste pedido na versão 2: “Troque o status Ativo por Disponível”")).toBeVisible();

  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(page.getByRole("row", { name: /Limitar cupons por pedido/ }).first()).toContainText("2");
});

test("usuário comum não vê a Administração", async ({ page }) => {
  await entrar(page, "comum@exemplo.dev", "senha-comum");
  await expect(page.getByRole("button", { name: "Histórico", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Administração" })).toHaveCount(0);
  expect((await page.request.get("/api/admin/ajustes")).status()).toBe(403);
});

test("administração salva ajustes, cria usuário e registra a alteração", async ({ page }) => {
  await entrar(page);
  await page.getByRole("button", { name: "Administração" }).click();
  await expect(page.getByRole("heading", { name: "Inteligência artificial" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Gemini (Google) (sem chave)" })).toBeDisabled();

  await page.getByLabel("Gerações por pessoa por hora").fill("50");
  await page.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect(page.getByText("Ajustes salvos. Valem a partir da próxima geração.")).toBeVisible();
  await expect(page.locator(".alteracoes-lista")).toContainText("Limite por hora: 100 → 50");

  await page.getByLabel("E-mail", { exact: true }).fill("nova@exemplo.dev");
  await page.getByLabel("Senha inicial").fill("senha-da-nova");
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expect(page.getByText("Usuário nova criado.")).toBeVisible();
  await expect(page.getByRole("row", { name: /nova@exemplo\.dev/ })).toContainText("Usuário");
});

test("formulários avisam no próprio campo, sem o balão do navegador", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar" }).click();
  const usuario = page.getByLabel("Usuário ou e-mail");
  await expect(usuario).toHaveAttribute("aria-invalid", "true");
  await expect(usuario).toHaveAccessibleDescription("Preencha este campo.");
  await expect(usuario).toBeFocused();
  await usuario.fill("qa");
  await expect(usuario).not.toHaveAttribute("aria-invalid", "true");

  await entrar(page);
  await page.getByRole("button", { name: "Administração" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("sem-arroba");
  await page.getByLabel("Senha inicial").fill("curta");
  await page.getByRole("button", { name: "Criar usuário" }).click();
  // getByRole usa o nome acessível, que não inclui a mensagem de erro (aria-hidden).
  await expect(page.getByRole("textbox", { name: "E-mail", exact: true })).toHaveAccessibleDescription("Digite um e-mail válido, como nome@empresa.com.");
  await expect(page.getByLabel(/^Senha inicial/)).toHaveAccessibleDescription("Use pelo menos 8 caracteres.");
});

test("trocar nome usa o diálogo do sistema e valida o formato", async ({ page }) => {
  page.on("dialog", () => {
    throw new Error("abriu uma caixa nativa do navegador");
  });
  await entrar(page);
  await page.getByRole("button", { name: "Administração" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("bia@exemplo.dev");
  await page.getByLabel("Senha inicial").fill("senha-da-bia");
  await page.getByRole("button", { name: "Criar usuário" }).click();
  const linha = page.getByRole("row", { name: /bia@exemplo\.dev/ });

  await linha.getByRole("button", { name: "Trocar nome" }).click();
  const dialogo = page.getByRole("dialog", { name: "Trocar o nome de usuário" });
  await expect(dialogo).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();

  await linha.getByRole("button", { name: "Trocar nome" }).click();
  const campo = dialogo.getByLabel("Nome de usuário");
  await expect(campo).toHaveValue("bia");
  await campo.fill("x");
  await dialogo.getByRole("button", { name: "Salvar nome" }).click();
  await expect(campo).toHaveAccessibleDescription(/de 2 a 40 caracteres/);
  await campo.fill("Bia.Souza");
  await dialogo.getByRole("button", { name: "Salvar nome" }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText("Nome de usuário trocado para bia.souza.")).toBeVisible();
});

test("apagar do histórico pede confirmação no diálogo do sistema", async ({ page }) => {
  page.on("dialog", () => {
    throw new Error("abriu uma caixa nativa do navegador");
  });
  await entrar(page);
  await gerar(page, "Apagar: limitar cupons a 3 por pedido.");
  await expect(page.getByText("Guardada no histórico.")).toBeVisible();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  const linhas = page.getByRole("row", { name: /Limitar cupons por pedido/ });
  await expect(linhas.first()).toBeVisible();
  const antes = await linhas.count();

  await linhas.first().getByRole("button", { name: "Apagar" }).click();
  const dialogo = page.getByRole("dialog", { name: "Apagar esta issue?" });
  await expect(dialogo.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(linhas).toHaveCount(antes);

  await linhas.first().getByRole("button", { name: "Apagar" }).click();
  await dialogo.getByRole("button", { name: "Apagar" }).click();
  await expect(linhas).toHaveCount(antes - 1);
});

test("rascunho automático: o que foi digitado volta depois de recarregar e some ao gerar", async ({ page }) => {
  await entrar(page);
  await page.getByLabel(/^Descrição/).fill("Rascunho: limitar cupons a 3 por pedido.");
  await page.getByLabel("Nome do produto").fill("Loja Rascunho");
  await page.getByLabel(/^Contexto/).fill("Regra do checkout.");
  await page.reload();
  await expect(page.getByLabel(/^Descrição/)).toHaveValue("Rascunho: limitar cupons a 3 por pedido.");
  await expect(page.getByLabel("Nome do produto")).toHaveValue("Loja Rascunho");
  await expect(page.getByLabel(/^Contexto/)).toHaveValue("Regra do checkout.");

  await page.getByRole("button", { name: "Gerar issue" }).click();
  await expect(page.getByRole("heading", { name: "Rascunho da issue" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Descrição/)).toHaveValue("");
});

test("usar como base abre uma issue nova com a entrada de outra", async ({ page }) => {
  await entrar(page);
  await gerar(page, "Base: limitar cupons a 3 por pedido.");
  await expect(page.getByText("Guardada no histórico.")).toBeVisible();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.getByRole("row", { name: /Limitar cupons por pedido/ }).first().getByRole("button", { name: "Usar como base" }).click();

  await expect(page.getByLabel(/^Descrição/)).toHaveValue("Base: limitar cupons a 3 por pedido.");
  await expect(page.getByLabel("Nome do produto")).toHaveValue("Loja Exemplo");
  await expect(page.getByRole("heading", { name: "Rascunho da issue" })).toHaveCount(0);
});

test("Baixar PDF abre a impressão só com a issue e o cabeçalho", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { titulosImpressos: string[] }).titulosImpressos = [];
    window.print = () => (window as unknown as { titulosImpressos: string[] }).titulosImpressos.push(document.title);
  });
  await entrar(page);
  await gerar(page, "PDF: limitar cupons a 3 por pedido.");
  await expect(page.locator(".issue h3", { hasText: "Dúvidas para o PO" })).toBeVisible();

  await page.getByRole("button", { name: "Baixar PDF" }).click();
  expect(await page.evaluate(() => (window as unknown as { titulosImpressos: string[] }).titulosImpressos)).toEqual(["limitar-cupons-por-pedido"]);
  expect(await page.title()).toBe("Issue Doc Generator");

  await page.emulateMedia({ media: "print" });
  const cabecalho = page.locator(".metadados-pdf");
  await expect(cabecalho).toBeVisible();
  await expect(cabecalho).toContainText("ProdutoLoja Exemplo");
  await expect(cabecalho).toContainText("Autorqa");
  await expect(cabecalho).toContainText("Versão1");
  await expect(page.locator(".issue h3", { hasText: "Dúvidas para o PO" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar issue" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Baixar PDF" })).toBeHidden();
  await expect(page.locator(".rodape")).toBeHidden();
});

test("busca no histórico filtra por produto e por texto", async ({ page }) => {
  await entrar(page);
  await page.getByLabel(/^Descrição/).fill("Busca: limitar cupons a 3 por pedido.");
  await page.getByLabel("Nome do produto").fill("Portal Busca");
  await page.getByRole("button", { name: "Gerar issue" }).click();
  await expect(page.getByText("Guardada no histórico.")).toBeVisible();

  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  const linhas = page.getByRole("row", { name: /Limitar cupons por pedido/ });
  await expect(linhas.first()).toBeVisible();

  await page.getByLabel("Produto", { exact: true }).fill("portal busca");
  await expect(linhas).toHaveCount(1);
  await expect(linhas.first()).toContainText("Portal Busca");

  await page.getByLabel("Buscar").fill("nada-com-isso-xyz");
  await expect(page.getByText("Nenhuma issue encontrada com esses filtros.")).toBeVisible();

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByLabel("Buscar")).toHaveValue("");
  await expect(linhas.first()).toBeVisible();
});

test("status da issue: muda para Revisada, mostra quem mudou e filtra no histórico", async ({ page }) => {
  await entrar(page);
  await gerar(page, "Status: limitar cupons a 3 por pedido.");
  await expect(page.getByText("Guardada no histórico.")).toBeVisible();
  const status = page.getByLabel("Status da issue");
  await expect(status).toHaveValue("rascunho");
  await status.selectOption("revisada");
  await expect(page.getByText(/Revisada por qa em/)).toBeVisible();

  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.getByLabel("Filtrar por status").selectOption("revisada");
  const linhas = page.getByRole("row", { name: /Limitar cupons por pedido/ });
  // O filtro espera uma pausa antes de buscar: espera a lista sem nenhuma em Rascunho.
  await expect(page.locator("tbody .selo-status", { hasText: "Rascunho" })).toHaveCount(0);
  await expect(linhas.first()).toContainText("Revisada");
});

test("casos de teste em CSV no formato do Xray", async ({ page }) => {
  await entrar(page);
  await gerar(page, "CSV: limitar cupons a 3 por pedido.");
  await expect(page.getByRole("heading", { name: "Rascunho da issue" })).toBeVisible();
  await page.getByLabel("Formato do CSV").selectOption("xray");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar CSV" }).click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toBe("limitar-cupons-por-pedido-casos-xray.csv");
  const csv = await readFile(await arquivo.path(), "utf8");
  expect(csv.split("\r\n")[0]).toBe('\uFEFF"Issue ID","Summary","Test Type","Description","Action","Data","Result","Labels"');
  expect(csv).toContain('"Manual"');
});

test("link de compartilhamento abre a issue sem login até ser revogado", async ({ page, browser }) => {
  await entrar(page);
  await gerar(page, "Link: limitar cupons a 3 por pedido.");
  await expect(page.getByText("Guardada no histórico.")).toBeVisible();
  await page.getByLabel("Validade do link").selectOption("1");
  await page.getByRole("button", { name: "Criar link de leitura" }).click();
  const link = await page.getByLabel("Link de compartilhamento").inputValue();
  expect(link).toMatch(/\/compartilhado\/[A-Za-z0-9_-]{32,}$/);

  const anonimo = await (await browser.newContext()).newPage();
  await anonimo.goto(link);
  await expect(anonimo.locator(".issue h1", { hasText: "Limitar cupons por pedido" })).toBeVisible();
  await expect(anonimo.getByText(/Issue compartilhada só para leitura/)).toBeVisible();
  await expect(anonimo.getByRole("button", { name: "Entrar" })).toHaveCount(0);

  await page.getByRole("list", { name: "Links ativos" }).getByRole("button", { name: "Revogar" }).first().click();
  await page.getByRole("dialog", { name: "Revogar este link?" }).getByRole("button", { name: "Revogar" }).click();
  await anonimo.reload();
  await expect(anonimo.getByRole("heading", { name: "Link indisponível" })).toBeVisible();
});

test("issue em inglês: o Markdown sai com os títulos em inglês", async ({ page }) => {
  await entrar(page);
  await page.getByLabel("Idioma da issue").selectOption("en");
  await gerar(page, "Idioma: limitar cupons a 3 por pedido.");
  await expect(page.locator(".issue h2", { hasText: "Acceptance Criteria" })).toBeVisible();
  await expect(page.locator(".issue h2", { hasText: "Test cases" })).toBeVisible();
});

test("administração mostra a seção de backup e o campo de cópias", async ({ page }) => {
  await entrar(page);
  await page.getByRole("button", { name: "Administração" }).click();
  await expect(page.getByRole("heading", { name: "Backup do banco" })).toBeVisible();
  await expect(page.getByText("O banco está em memória (modo de teste): não há backup.")).toBeVisible();
  await expect(page.getByLabel("Backups do banco guardados")).toHaveValue("7");
});

test("a issue gerada vem com a nota de qualidade, também ao abrir do histórico", async ({ page }) => {
  await entrar(page);
  await gerar(page, "Qualidade: limitar cupons a 3 por pedido.");
  const nota = page.locator(".qualidade");
  await expect(nota.getByLabel(/^Nota \d+ de 100$/)).toBeVisible();
  await nota.locator("summary").click();
  await expect(nota.getByRole("heading", { name: /Casos de teste \(ISTQB/ })).toBeVisible();

  await expect(page.getByText("Guardada no histórico.")).toBeVisible();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.getByRole("row", { name: /Limitar cupons por pedido/ }).first().getByRole("button", { name: "Abrir" }).click();
  await expect(page.locator(".qualidade").getByLabel(/^Nota \d+ de 100$/)).toBeVisible();
});

test("anexa um print e gera a issue; o print não fica para a próxima", async ({ page }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await entrar(page);
  await page.getByLabel("Escolher imagens").setInputFiles({ name: "tela.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("img", { name: "Prévia de tela.png" })).toBeVisible();
  const pedido = page.waitForRequest((r) => r.url().endsWith("/api/gerar"));
  await gerar(page, "Print: o botão de cupom some.");
  expect((await pedido).postDataJSON().imagens).toEqual([{ tipo: "image/png", dados: png.toString("base64") }]);
  await expect(page.locator(".issue h3", { hasText: "Dúvidas para o PO" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Prévia de tela.png" })).toHaveCount(0);
});

test("cria a issue no Jira uma vez e mostra o link", async ({ page }) => {
  await entrar(page);
  await gerar(page, "Jira: limitar cupons a 3 por pedido.");
  await expect(page.getByText("Guardada no histórico.")).toBeVisible();
  await page.getByRole("button", { name: "Criar no Jira" }).click();
  const jira = page.locator(".jira");
  await jira.getByLabel(/^Projeto/).selectOption("LOJ");
  await jira.getByLabel(/^Tipo/).selectOption({ label: "História" });
  await page.getByRole("button", { name: "Criar issue no Jira" }).click();
  const link = page.getByRole("link", { name: /^LOJ-\d+ ↗$/ });
  await expect(link).toHaveAttribute("href", /^https:\/\/jira\.exemplo\.dev\/browse\/LOJ-\d+$/);
  await expect(page.getByRole("button", { name: "Criar no Jira" })).toHaveCount(0);
});

test("a política de conteúdo (CSP) não bloqueia nada nas telas", async ({ page, context }) => {
  const violacoes: string[] = [];
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`));
  });
  page.on("console", (m) => {
    if (m.type() === "error" && /CSP|Content Security Policy/i.test(m.text())) violacoes.push(m.text());
  });
  page.on("pageerror", (e) => violacoes.push(String(e)));

  const resposta = await page.goto("/");
  expect(resposta?.headers()["content-security-policy"]).toContain("script-src 'self'");
  await entrar(page);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Escolher imagens").setInputFiles({ name: "tela.png", mimeType: "image/png", buffer: png });
  await gerar(page, "CSP: limitar cupons a 3 por pedido.");
  await expect(page.locator(".issue h3", { hasText: "Dúvidas para o PO" })).toBeVisible();
  await page.locator(".qualidade summary").click();
  await page.getByRole("button", { name: "Criar link de leitura" }).click();
  const link = await page.getByLabel("Link de compartilhamento").inputValue();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.getByRole("button", { name: "Administração" }).click();
  await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
  await page.goto(link);
  await expect(page.locator(".issue h1")).toBeVisible();
  // O tema escolhido continua sendo aplicado antes da pintura (agora por /tema.js).
  await page.evaluate(() => localStorage.setItem("idg:tema", "escuro"));
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

  expect(violacoes).toEqual([]);
});

test("sessões: a lista mostra este dispositivo, encerra a outra sessão e sai de todos", async ({ page, browser }) => {
  // O outro navegador tem um nome próprio, para achá-lo na lista (outros testes deixam sessões abertas).
  const outro = await browser.newContext({ userAgent: "Navegador do outro teste" });
  const outraPagina = await outro.newPage();
  await entrar(outraPagina);
  await entrar(page);

  await abrirConta(page, "Sessões");
  const dialogo = page.getByRole("dialog", { name: "Minha conta" });
  await expect(dialogo).toBeVisible();
  const lista = dialogo.getByRole("list", { name: "Sessões abertas" });
  await expect(lista.getByRole("listitem").filter({ hasText: "este dispositivo" })).toHaveCount(1);
  const doOutro = lista.getByRole("listitem").filter({ hasText: "Navegador do outro teste" });
  await expect(doOutro).toHaveCount(1);

  // Encerra a sessão do outro navegador: lá, a próxima carga volta para o login.
  await doOutro.getByRole("button", { name: "Encerrar" }).click();
  await expect(doOutro).toHaveCount(0);
  await outraPagina.reload();
  await expect(outraPagina.getByRole("heading", { name: "Entrar" })).toBeVisible();

  // Sair de todos pede confirmação e leva este também ao login.
  await dialogo.getByRole("button", { name: "Sair de todos os dispositivos" }).click();
  await page.getByRole("dialog", { name: "Sair de todos os dispositivos?" }).getByRole("button", { name: "Sair de todos" }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await outro.close();
});

test("verificação em duas etapas: liga com o código do aplicativo, entra com um código de recuperação e desliga", async ({ page }) => {
  await entrar(page);
  await abrirConta(page, "Segurança");
  const dialogo = page.getByRole("dialog", { name: "Minha conta" });
  await dialogo.getByRole("button", { name: "Ligar a verificação em duas etapas" }).click();
  await expect(dialogo.getByRole("img", { name: "QR code para o aplicativo autenticador" })).toBeVisible();

  // O "aplicativo": calcula o código a partir da chave mostrada na tela.
  const segredo = (await dialogo.locator(".mfa-segredo").textContent())!.trim();
  await dialogo.getByLabel("Digite o código de 6 dígitos").fill(codigoDoPasso(deBase32(segredo), passoEm(Date.now())));
  await dialogo.getByRole("button", { name: "Ligar", exact: true }).click();
  const codigos = dialogo.getByRole("list", { name: "Códigos de recuperação" }).getByRole("listitem");
  await expect(codigos).toHaveCount(10);
  const recuperacao = (await codigos.first().textContent())!.trim();
  await dialogo.getByRole("button", { name: "Já guardei" }).click();
  await expect(dialogo.getByText("ligada")).toBeVisible();
  await dialogo.getByRole("button", { name: "Fechar" }).click();

  // Sai e entra de novo: depois da senha, pede o código.
  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByLabel("Usuário ou e-mail").fill("qa@exemplo.dev");
  await page.getByLabel("Senha").fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
  await page.getByLabel("Código do aplicativo autenticador").fill(recuperacao);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "O que está errado ou o que queremos" })).toBeVisible();

  // Desliga, para não afetar os outros testes (o login recente dispensa confirmar a senha).
  await abrirConta(page, "Segurança");
  await page.getByRole("dialog", { name: "Minha conta" }).getByRole("button", { name: "Desligar" }).click();
  await page.getByRole("dialog", { name: "Desligar a verificação em duas etapas?" }).getByRole("button", { name: "Desligar" }).click();
  await expect(page.getByRole("dialog", { name: "Minha conta" }).getByRole("button", { name: "Ligar a verificação em duas etapas" })).toBeVisible();
});

test("chave de acesso: cadastra no aparelho, sai e entra sem senha", async ({ page }) => {
  // Aparelho virtual do Chromium, com biometria que sempre confirma.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  // A chave vale só no endereço de URL_PUBLICA; em 127.0.0.1 a tela nem oferece.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Entrar com chave de acesso" })).toHaveCount(0);
  await page.goto("http://localhost:3555/");
  await page.getByLabel("Usuário ou e-mail").fill("comum@exemplo.dev");
  await page.getByLabel("Senha").fill("senha-comum");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "O que está errado ou o que queremos" })).toBeVisible();

  await abrirConta(page, "Segurança");
  const dialogo = page.getByRole("dialog", { name: "Minha conta" });
  await dialogo.getByRole("button", { name: "Adicionar chave de acesso" }).click();
  await expect(dialogo.getByRole("list", { name: "Chaves de acesso" }).getByText("ainda não usada")).toBeVisible();
  await dialogo.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByRole("button", { name: "Entrar com chave de acesso" }).click();
  await expect(page.getByRole("heading", { name: "O que está errado ou o que queremos" })).toBeVisible();

  // Remove, para não afetar os outros testes.
  await abrirConta(page, "Segurança");
  await dialogo.getByRole("list", { name: "Chaves de acesso" }).getByRole("button", { name: "Remover" }).click();
  await page.getByRole("dialog", { name: "Remover a chave de acesso?" }).getByRole("button", { name: "Remover" }).click();
  await expect(dialogo.getByRole("list", { name: "Chaves de acesso" })).toHaveCount(0);
});

test("Meu contexto: o aviso do primeiro acesso leva à aba, a IA resume e, salvo, o aviso some", async ({ page }) => {
  await entrar(page, "comum@exemplo.dev", "senha-comum");
  const aviso = page.getByRole("region", { name: "Conte sobre o seu sistema" });
  await expect(aviso).toBeVisible();
  await aviso.getByRole("button", { name: "Preencher agora" }).click();

  const dialogo = page.getByRole("dialog", { name: "Minha conta" });
  await expect(dialogo.getByRole("tab", { name: "Meu contexto" })).toHaveAttribute("aria-selected", "true");
  await dialogo.getByLabel("Sobre o seu sistema").fill("Trabalho no Painel Loja Exemplo, com Pedidos e Cupons. Cupom: no máximo 3 por pedido.");
  await dialogo.getByRole("button", { name: "Gerar versão compacta" }).click();
  const compacta = dialogo.getByLabel(/^Versão compacta/);
  await expect(compacta).toHaveValue(/Máximo de 3 cupons por pedido/);
  await compacta.fill("- Painel Loja Exemplo: Pedidos e Cupons\n- Até 3 cupons por pedido");
  await dialogo.getByRole("button", { name: "Salvar" }).click();
  await expect(dialogo.getByText("Contexto salvo.")).toBeVisible();
  await dialogo.getByRole("button", { name: "Fechar" }).click();
  await expect(aviso).toHaveCount(0);

  // Volta ao abrir de novo e não pede mais o aviso.
  await page.reload();
  await expect(page.getByRole("heading", { name: "O que está errado ou o que queremos" })).toBeVisible();
  await expect(aviso).toHaveCount(0);
  await abrirConta(page, "Meu contexto");
  await expect(dialogo.getByLabel(/^Versão compacta/)).toHaveValue("- Painel Loja Exemplo: Pedidos e Cupons\n- Até 3 cupons por pedido");

  // Apaga, para não afetar os outros testes.
  await dialogo.getByRole("button", { name: "Apagar" }).click();
  await page.getByRole("dialog", { name: "Apagar o seu contexto?" }).getByRole("button", { name: "Apagar" }).click();
  await expect(dialogo.getByText("Contexto apagado.")).toBeVisible();
});

test("Meu contexto: 'Agora não' fecha o aviso de vez", async ({ page }) => {
  await entrar(page);
  const aviso = page.getByRole("region", { name: "Conte sobre o seu sistema" });
  await aviso.getByRole("button", { name: "Agora não" }).click();
  await expect(aviso).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "O que está errado ou o que queremos" })).toBeVisible();
  await expect(aviso).toHaveCount(0);
});
