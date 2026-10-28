// Captura telas do painel em desktop e celular e verifica rolagem horizontal.
// Uso: node scripts/screenshots.mjs [baseUrl] — lê DEV_ADMIN_EMAIL/PASSWORD (comentários) de .env.local.
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3100";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => env.match(new RegExp(`^#?\\s*${k}=(.+)$`, "m"))?.[1].trim();
const email = pick("DEV_ADMIN_EMAIL");
const password = pick("DEV_ADMIN_PASSWORD");
const out = new URL("../../referencias/painel-admin-mvp/", import.meta.url);
mkdirSync(out, { recursive: true });

const pages = ["/", "/dispositivos", "/grupos", "/codigos", "/perfis", "/portais", "/conta", "/gestao", "/gestao/configuracoes", "/manutencao", "/reportes", "/portal-predefinido", "/sincronizacao", "/sincronizacao/configuracao", "/sincronizacao/dados", "/esportes", "/snapshots", "/conta?secao=integracoes", "/conta?secao=notificacoes"];
const browser = await chromium.launch({ channel: "msedge" });
const report = [];
for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["celular", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: label === "celular", hasTouch: label === "celular" });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL(`${base}/`), page.click("button[type=submit]")]);
  const firstDevice = await page.evaluate(async () => {
    const html = await (await fetch("/dispositivos")).text();
    return new DOMParser().parseFromString(html, "text/html").querySelector("tbody a")?.getAttribute("href");
  });
  const list = firstDevice ? [...pages, firstDevice, `${firstDevice}?secao=configuracoes`, `${firstDevice}?secao=ajustes`, `${firstDevice}?secao=copias`] : pages;
  for (const path of list) {
    await page.goto(`${base}${path}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const name = `${label}-${path.replace(/^\//, "").replace(/[/?=]/g, "_") || "dashboard"}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(name, out)), fullPage: true });
    report.push(`${label} ${path}: ${overflow ? "ROLAGEM HORIZONTAL" : "ok"}`);
  }
  await ctx.close();
}
await browser.close();
console.log(report.join("\n"));
