// Teste de fumaça pelo navegador: cria um grupo, adiciona um dispositivo e confere no painel do dispositivo.
// Uso: node scripts/e2e-groups.mjs [baseUrl] — usa o admin de teste de .env.local e os dados já cadastrados.
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
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

const name = `Grupo E2E ${Date.now().toString(36)}`;
await page.goto(`${base}/grupos`);
await page.fill("#new-group-name", name);
const profileOptions = await page.locator("#new-group-profile option").count();
if (profileOptions > 1) await page.selectOption("#new-group-profile", { index: 1 });
const firstPlaylist = page.locator("input[name=playlistIds]").first();
if (await firstPlaylist.count()) await firstPlaylist.check();
await Promise.all([page.waitForURL(/\/grupos\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Criar grupo" }).click()]);
await page.getByRole("heading", { level: 1, name }).waitFor();
console.log(`grupo criado: ${name}`);

const option = page.locator("#add-member option:not([disabled])").first();
if (!(await option.count())) throw new Error("nenhum dispositivo disponível para adicionar");
const deviceUuid = await option.getAttribute("value");
await page.selectOption("#add-member", deviceUuid);
await page.getByRole("button", { name: "Adicionar ao grupo" }).click();
await page.getByText("Dispositivo adicionado ao grupo").waitFor();
await page.reload();
console.log(`membros após adicionar: ${await page.locator("table.table tbody tr").count()}`);

await page.goto(`${base}/dispositivos/${deviceUuid}`);
const groupFact = await page.locator(".fact", { hasText: "Grupo" }).locator("dd").textContent();
console.log(`painel do dispositivo mostra grupo: ${groupFact}`);
console.log(errors.length ? `ERROS: ${errors.join(" | ")}` : "sem erros de página");
await browser.close();
if (groupFact?.trim() !== name) process.exit(1);
