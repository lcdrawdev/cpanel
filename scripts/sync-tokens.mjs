// Copies the design-system tokens (single source of truth) into the app.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../../design-system/tokens/tokens.css", import.meta.url));
const dest = fileURLToPath(new URL("../src/styles/tokens.css", import.meta.url));
writeFileSync(dest, `/* GERADO por scripts/sync-tokens.mjs a partir de design-system/tokens/tokens.css. Não edite aqui. */\n${readFileSync(src, "utf8")}`);
console.log("tokens sincronizados");
