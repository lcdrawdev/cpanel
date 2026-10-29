// Copies the design-system tokens (single source of truth) into the app.
// The design system lives next to the panel in the project folder; where it is absent (CI, Vercel)
// the copy already committed in src/styles/tokens.css is used as is.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../../design-system/tokens/tokens.css", import.meta.url));
const dest = fileURLToPath(new URL("../src/styles/tokens.css", import.meta.url));
if (!existsSync(src)) {
  console.log("design-system ausente: usando src/styles/tokens.css do repositório");
} else {
  writeFileSync(dest, `/* GERADO por scripts/sync-tokens.mjs a partir de design-system/tokens/tokens.css. Não edite aqui. */\n${readFileSync(src, "utf8")}`);
  console.log("tokens sincronizados");
}
