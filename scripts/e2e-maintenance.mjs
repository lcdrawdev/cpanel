// Teste de fumaça pelo navegador: liga e desliga o modo manutenção e salva as políticas.
// Uso: node scripts/e2e-maintenance.mjs [baseUrl] [on|off]
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const mode = process.argv[3] ?? "on";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (key) => env.match(new RegExp(String.raw`^#?\s*${key}=(.+)$`, "m"))?.[1].trim();

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${base}/login`);
await page.fill("#email", pick("DEV_ADMIN_EMAIL"));
await page.fill("#password", pick("DEV_ADMIN_PASSWORD"));
await Promise.all([page.waitForURL(`${base}/`), page.click("button[type=submit]")]);

await page.goto(`${base}/manutencao`);
const toggle = page.locator("input[name=enabled]");
await toggle.waitFor();
if (mode === "on") {
  await toggle.check();
  await page.fill("#message", "Manutenção de teste. Voltamos em instantes.");
  await page.fill("#supportLine", "Suporte de teste");
} else {
  await toggle.uncheck();
}
await page.getByRole("button", { name: "Aplicar" }).click();
await page.locator(".alert-success, .alert-danger").first().waitFor();
console.log(`manutenção: ${(await page.locator(".alert-success, .alert-danger").first().textContent())?.trim()}`);

await page.goto(`${base}/`);
await page.locator(".kpi").first().waitFor();
console.log(`aviso no dashboard: ${(await page.getByText("Modo manutenção ativo").count()) > 0 ? "sim" : "não"}`);

await page.goto(`${base}/gestao/configuracoes`);
await page.fill("#accountNickname", "Suporte de teste");
await page.getByRole("button", { name: "Salvar políticas" }).click();
await page.locator(".alert-success, .alert-danger").first().waitFor();
console.log(`políticas: ${(await page.locator(".alert-success, .alert-danger").first().textContent())?.trim()}`);
console.log(errors.length ? `ERROS: ${errors.join(" | ")}` : "sem erros de página");
await browser.close();
