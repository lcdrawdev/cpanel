import "server-only";
import path from "node:path";
import { createDatabase, type Database } from "./create";

// One database per server process. In dev the module is re-evaluated on HMR,
// so the instance lives on globalThis to avoid opening PGlite twice.
const globalForDb = globalThis as unknown as { sflDb?: Promise<Database> };

export function getDb(): Promise<Database> {
  if (!globalForDb.sflDb) {
    globalForDb.sflDb = createDatabase({
      databaseUrl: process.env.DATABASE_URL,
      pgliteDir: process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"),
    }).catch((e) => {
      // Do not keep a failed open around; the next request retries.
      globalForDb.sflDb = undefined;
      throw e;
    });
  }
  return globalForDb.sflDb;
}
