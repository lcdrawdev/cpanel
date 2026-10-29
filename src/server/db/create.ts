import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

/**
 * Opens the database and applies pending migrations.
 * - `databaseUrl` set: real PostgreSQL (production).
 * - otherwise: embedded PGlite at `pgliteDir`, or in memory when `pgliteDir` is "memory://".
 */
export async function createDatabase(opts: { databaseUrl?: string; pgliteDir?: string; migrate?: boolean }): Promise<Database> {
  // Migrations run when opening PGlite (local/tests), but NOT when connecting to production PostgreSQL: Supabase's
  // transaction pooler, which Vercel has to use, rejects the migrator (CREATE SCHEMA "drizzle" fails). In production
  // the schema is applied once by `npm run db:migrate` against the direct connection, not on every request.
  const migrate = opts.migrate ?? !opts.databaseUrl;
  if (opts.databaseUrl) {
    const pool = new Pool({ connectionString: opts.databaseUrl, ssl: sslFor(opts.databaseUrl), max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
    const db = drizzlePg(pool, { schema });
    if (migrate) await migratePg(db, { migrationsFolder });
    // Both drivers expose the same query builder; the cast keeps one type across the app.
    return db as unknown as Database;
  }
  const dataDir = opts.pgliteDir ?? "memory://";
  if (!dataDir.startsWith("memory://")) mkdirSync(path.dirname(dataDir), { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  if (migrate) await migratePglite(db, { migrationsFolder });
  return db;
}

/** The database or an open transaction; helpers that may run inside a transaction take this. */
export type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * TLS for a hosted PostgreSQL. Supabase signs its servers with its own root certificate (certs/, public),
 * so the connection is verified against it instead of turning verification off. Local databases: no TLS.
 */
function sslFor(url: string) {
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return undefined;
  const ca = path.join(process.cwd(), "certs", "supabase-prod-ca-2021.crt");
  if (/supabase\.(co|com)$/.test(host) && existsSync(ca)) return { ca: readFileSync(ca, "utf8") };
  return { rejectUnauthorized: true };
}