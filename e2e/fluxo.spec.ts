import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

type Esperado = { gerado: string; refinado: string; chave: string };

async function esperado(page: Page): Promise<Esperado> {
  return (await page.request.get("/e2e/esperado")).json();
}

async function entrar(page: Page, email = "qa@exemplo.dev", senha = "senha-de-teste") {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "O que está errado ou o que queremos" })).toBeVisible();
}

async function gerar(page: Page, descricao: string) {
  await page.getByLabel(/^Descrição/).fill(descricao);
  await page.getByLabel("Nome do produto").fill("Loja Exemplo");
  await page.getByRole("button", { name: "Gerar issue" }).click();
}

test("sem login, a tela pede e-mail e senha e recusa senha errada", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.getByLabel("E-mail").fill("qa@exemplo.dev");
  await page.getByLabel("Senha").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
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
  await expect(page.getByRole("heading", { name: "Uso", exact: true })).toBeVisible();
  await expect(page.locator(".indicador", { hasText: "Gerações e refinamentos" })).not.toContainText(/^Gerações e refinamentos0$/);
  await expect(page.getByRole("heading", { name: "Por pessoa" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Gemini (Google) (sem chave)" })).toBeDisabled();

  await page.getByLabel("Gerações por pessoa por hora").fill("50");
  await page.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect(page.getByText("Ajustes salvos. Valem a partir da próxima geração.")).toBeVisible();
  await expect(page.locator(".alteracoes-lista")).toContainText("Limite por hora: 100 → 50");

  await page.getByLabel("E-mail", { exact: true }).fill("nova@exemplo.dev");
  await page.getByLabel("Senha inicial").fill("senha-da-nova");
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expect(page.getByText("Usuário nova@exemplo.dev criado.")).toBeVisible();
  await expect(page.getByRole("row", { name: /nova@exemplo\.dev/ })).toContainText("Usuário");
});
