// Copies every table of the local PGlite database to the PostgreSQL in DATABASE_URL (schema created by the
// migrations first). Usage: DATABASE_URL=... node --env-file=.env.local scripts/copy-to-postgres.mjs
// Refuses to run when the target already has data.
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida.");
const host = new URL(url).hostname;
const caFile = path.join(process.cwd(), "certs", "supabase-prod-ca-2021.crt");
const ssl = /supabase\.(co|com)$/.test(host) && existsSync(caFile) ? { ca: readFileSync(caFile, "utf8") } : { rejectUnauthorized: true };

const pool = new pg.Pool({ connectionString: url, ssl, max: 2 });
await migrate(drizzle(pool), { migrationsFolder: path.join(process.cwd(), "drizzle") });
const local = new PGlite(path.join(process.cwd(), ".data", "pglite"));

const tables = (await pool.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")).rows.map((r) => r.table_name);
// Parents before children (foreign keys).
const deps = (await pool.query(`select tc.table_name as child, ccu.table_name as parent from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'`)).rows;
const order = [];
const visit = (t, seen = new Set()) => { if (order.includes(t) || seen.has(t)) return; seen.add(t); deps.filter((d) => d.child === t && d.parent !== t).forEach((d) => visit(d.parent, seen)); order.push(t); };
tables.forEach((t) => visit(t));

for (const t of order) {
  const n = Number((await pool.query(`select count(*) from "${t}"`)).rows[0].count);
  if (n > 0) throw new Error(`A tabela ${t} já tem dados no destino; nada foi copiado.`);
}
const client = await pool.connect();
try {
  await client.query("begin");
  for (const t of order) {
    const cols = (await pool.query("select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1", [t])).rows;
    const rows = (await local.query(`select * from "${t}"`)).rows;
    for (const r of rows) {
      const names = cols.map((c) => `"${c.column_name}"`).join(",");
      const vals = cols.map((c) => (c.data_type === "jsonb" || c.data_type === "json") && r[c.column_name] != null ? JSON.stringify(r[c.column_name]) : r[c.column_name]);
      await client.query(`insert into "${t}" (${names}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, vals);
    }
    console.log(`${t}: ${rows.length}`);
  }
  await client.query("commit");
} catch (e) {
  await client.query("rollback");
  throw e;
} finally {
  client.release();
  await pool.end();
  await local.close();
}
