/**
 * Applies the database migrations once, by hand. Run it against the DIRECT Supabase connection
 * (the "Direct connection" string, port 5432), NOT the Transaction pooler — the pooler rejects the
 * migrator. The running panel on Vercel uses the pooler only to read and write, never to migrate.
 *
 *   npm run db:migrate              (reads DATABASE_URL from the environment / .env.local)
 *   MIGRATE_DATABASE_URL=... npm run db:migrate
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createDatabase } from "../src/server/db/create";

// Load .env.local (simple KEY=VALUE lines) when the variable is not already set.
function fromEnvLocal(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const file = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of file.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[1] === key) return m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* no .env.local */
  }
  return undefined;
}

const url = fromEnvLocal("MIGRATE_DATABASE_URL") ?? fromEnvLocal("DATABASE_URL");
if (!url) {
  console.error("Defina DATABASE_URL (ou MIGRATE_DATABASE_URL) com a conexão direta do Supabase.");
  process.exit(1);
}

const host = new URL(url).host;
if (host.includes("pooler.supabase.com")) {
  console.error(`\nUse a conexão DIRETA (porta 5432), não o pooler. Host informado: ${host}\n`);
  process.exit(1);
}

console.log(`Aplicando migrações em ${host}…`);
await createDatabase({ databaseUrl: url, migrate: true });
console.log("Migrações aplicadas. Pode recarregar o painel no Vercel.");
process.exit(0);
