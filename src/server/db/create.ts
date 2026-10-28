import { mkdirSync } from "node:fs";
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
export async function createDatabase(opts: { databaseUrl?: string; pgliteDir?: string }): Promise<Database> {
  if (opts.databaseUrl) {
    const pool = new Pool({ connectionString: opts.databaseUrl });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    // Both drivers expose the same query builder; the cast keeps one type across the app.
    return db as unknown as Database;
  }
  const dataDir = opts.pgliteDir ?? "memory://";
  if (!dataDir.startsWith("memory://")) mkdirSync(path.dirname(dataDir), { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return db;
}

/** The database or an open transaction; helpers that may run inside a transaction take this. */
export type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
