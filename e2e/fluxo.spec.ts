import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

type Esperado = { gerado: string; refinado: string; chave: string };

async function esperado(page: Page): Promise<Esperado> {
  return (await page.request.get("/e2e/esperado")).json();
}

async function entrar(page: Page) {
  await page.goto("/");
  await page.getByLabel("E-mail").fill("qa@exemplo.dev");
  await page.getByLabel("Senha").fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "O que está errado ou o que queremos" })).toBeVisible();
}

async function gerar(page: Page, descricao: string) {
  await page.getByLabel(/^Descrição/).fill(descricao);
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
