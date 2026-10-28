// Prepara dados de TESTE para o app de TV: playlist M3U de demonstração (public/dev) + código de ativação.
// Uso: node scripts/create-test-code.mjs [baseUrl] [urlDaListaVistaPeloApp]
// Imprime só o código gerado (para usar em testes automatizados do app).
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const listUrl = process.argv[3] ?? `${base}/dev/canais-teste.m3u`;
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (key) => env.match(new RegExp(String.raw`^#?\s*${key}=(.+)$`, "m"))?.[1].trim();
const PLAYLIST = "Canais de teste (dev)";

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
await page.goto(`${base}/login`);
await page.fill("#email", pick("DEV_ADMIN_EMAIL"));
await page.fill("#password", pick("DEV_ADMIN_PASSWORD"));
await Promise.all([page.waitForURL(`${base}/`), page.click("button[type=submit]")]);

await page.goto(`${base}/portais`);
await page.locator("main h1").first().waitFor();
if (!(await page.getByText(PLAYLIST, { exact: true }).count())) {
  await page.getByRole("button", { name: "Adicionar playlist" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("input[name=name]").fill(PLAYLIST);
  await dialog.locator("select[name=type]").selectOption("m3u");
  await dialog.locator("input[name=url]").fill(listUrl);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await dialog.getByText("Playlist cadastrada.").waitFor();
}

await page.goto(`${base}/codigos`);
await page.getByRole("button", { name: "Criar código" }).first().click();
const dialog = page.locator("dialog[open]");
await dialog.locator("input[name=label]").fill("App TV teste");
await dialog.locator("input[name=maxUses]").fill("20");
await dialog.getByText(PLAYLIST).click();
await dialog.getByRole("button", { name: "Gerar código" }).click();
const ok = await dialog.locator(".alert-success").textContent();
console.log(ok.match(/Código (\w+) criado/)[1]);
await browser.close();
