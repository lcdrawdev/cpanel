// Abre páginas num Edge sem extensões (perfil temporário) e lista erros/avisos de hidratação no console.
// Uso: node scripts/check-hydration.mjs [baseUrl] [caminhos...]
// No Git Bash, rode com MSYS_NO_PATHCONV=1 para os caminhos não virarem caminhos do Windows.
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const [base = "http://localhost:3000", ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ["/login"];
const PUBLIC = ["/login", "/setup"];

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
const messages = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") messages.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => messages.push(`[pageerror] ${e.message.slice(0, 300)}`));

// Pages behind login: sign in first with the local test admin from .env.local.
if (targets.some((p) => !PUBLIC.includes(p))) {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const pick = (key) => env.match(new RegExp(String.raw`^#?\s*${key}=(.+)$`, "m"))?.[1].trim();
  await page.goto(`${base}/login`);
  await page.fill("#email", pick("DEV_ADMIN_EMAIL"));
  await page.fill("#password", pick("DEV_ADMIN_PASSWORD"));
  await Promise.all([page.waitForURL(`${base}/`), page.click("button[type=submit]")]);
}

for (const path of targets) {
  await page.goto(`${base}${path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const attrs = await page.evaluate(() => ({
    html: [...document.documentElement.attributes].map((a) => a.name),
    body: [...document.body.attributes].map((a) => a.name),
  }));
  console.log(`${path} → <html> ${attrs.html.join(",")} · <body> ${attrs.body.join(",") || "(nenhum)"}`);
}

const hydration = messages.filter((m) => /hydrat/i.test(m));
console.log(`mensagens de console: ${messages.length} · de hidratação: ${hydration.length}`);
for (const m of messages) console.log(m);
await browser.close();
