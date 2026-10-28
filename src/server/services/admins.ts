import { and, count, eq, gt } from "drizzle-orm";
import type { Database } from "../db/create";
import { admins, sessions } from "../db/schema";
import { hashPassword, newToken, sha256, verifyPassword } from "../crypto";
import { ServiceError } from "./errors";
import { audit } from "./audit";

export const SESSION_DAYS = 7;

export async function adminCount(db: Database) {
  const [row] = await db.select({ n: count() }).from(admins);
  return row.n;
}

/** First-run only: creates the owner account when no admin exists yet. */
export async function createFirstAdmin(db: Database, input: { name: string; email: string; password: string }) {
  if ((await adminCount(db)) > 0) throw new ServiceError("setup_done", "A configuração inicial já foi concluída.", 409);
  validatePassword(input.password);
  const [admin] = await db
    .insert(admins)
    .values({ name: input.name.trim(), email: input.email.trim().toLowerCase(), passwordHash: await hashPassword(input.password) })
    .returning();
  await audit(db, admin.email, "admin.created", admin.id);
  return admin;
}

export async function login(db: Database, email: string, password: string) {
  const admin = await db.query.admins.findFirst({ where: eq(admins.email, email.trim().toLowerCase()) });
  // Same message for unknown e-mail and wrong password, so the form doesn't reveal which accounts exist.
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    throw new ServiceError("invalid_credentials", "E-mail ou senha incorretos.", 401);
  }
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: sha256(token), adminId: admin.id, expiresAt });
  await audit(db, admin.email, "admin.login", admin.id);
  return { token, expiresAt };
}

export async function adminForSession(db: Database, token: string) {
  const row = await db
    .select({ id: admins.id, name: admins.name, email: admins.email })
    .from(sessions)
    .innerJoin(admins, eq(admins.id, sessions.adminId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row[0] ?? null;
}

export async function logout(db: Database, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function changePassword(db: Database, adminId: string, current: string, next: string) {
  const admin = await db.query.admins.findFirst({ where: eq(admins.id, adminId) });
  if (!admin || !(await verifyPassword(current, admin.passwordHash))) {
    throw new ServiceError("invalid_password", "A senha atual está incorreta.", 400);
  }
  validatePassword(next);
  await db.update(admins).set({ passwordHash: await hashPassword(next) }).where(eq(admins.id, adminId));
  // Changing the password ends every other session.
  await db.delete(sessions).where(eq(sessions.adminId, adminId));
  await audit(db, admin.email, "admin.password_changed", admin.id);
}

function validatePassword(password: string) {
  if (password.length < 10) throw new ServiceError("weak_password", "A senha precisa ter pelo menos 10 caracteres.");
}
