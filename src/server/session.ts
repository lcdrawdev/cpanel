import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "./db/client";
import { adminForSession } from "./services/admins";

export const SESSION_COOKIE = "painel_session";

/** Data Access Layer entry point: every page section and server action starts here. */
export async function getCurrentAdmin() {
  // Session checks compare against the current time, so they always run per request.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return adminForSession(await getDb(), token);
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  return admin;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
