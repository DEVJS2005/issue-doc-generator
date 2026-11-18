import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

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

test("auditoria mostra quem entrou e o login recusado, com filtro por ação", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Usuário ou e-mail").fill("qa");
  await page.getByLabel("Senha").fill("senha-errada-x");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Usuário ou senha incorretos.");

  await entrar(page);
  await page.getByRole("button", { name: "Administração" }).click();
  const auditoria = page.locator("section", { has: page.getByRole("heading", { name: "Auditoria" }) });
  await expect(auditoria.getByRole("cell", { name: "Login recusado" }).first()).toBeVisible();
  await expect(auditoria.getByRole("cell", { name: /tentou como “qa”/ }).first()).toBeVisible();
  await expect(auditoria).not.toContainText("senha-errada-x");

  await auditoria.getByLabel("Ação").selectOption({ label: "Entrou" });
  await expect(auditoria.getByRole("cell", { name: "Login recusado" })).toHaveCount(0);
  await expect(auditoria.getByRole("cell", { name: "Entrou" }).first()).toBeVisible();
});

test("no celular, nenhuma aba ganha rolagem horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page);
  for (const aba of ["Gerar", "Histórico", "Administração"]) {
    await page.getByRole("button", { name: aba, exact: true }).click();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth), aba).toBeLessThanOrEqual(390);
  }
});
