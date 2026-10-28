import { desc } from "drizzle-orm";
import type { DbOrTx } from "../db/create";
import { auditLog } from "../db/schema";

export async function audit(db: DbOrTx, actor: string, action: string, target?: string) {
  await db.insert(auditLog).values({ actor, action, target });
}

export async function recentAudit(db: DbOrTx, limit = 10) {
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}
