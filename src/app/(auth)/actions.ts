"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { createFirstAdmin, login, logout } from "@/server/services/admins";
import { ServiceError } from "@/server/services/errors";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/server/session";
import type { ActionResult } from "@/components/forms";

export async function loginAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const session = await login(await getDb(), String(form.get("email") ?? ""), String(form.get("password") ?? ""));
    await setSessionCookie(session.token, session.expiresAt);
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  redirect("/");
}

export async function setupAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "As senhas não conferem." };
  try {
    const db = await getDb();
    const email = String(form.get("email") ?? "");
    await createFirstAdmin(db, { name: String(form.get("name") ?? ""), email, password });
    const session = await login(db, email, password);
    await setSessionCookie(session.token, session.expiresAt);
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  redirect("/");
}

export async function logoutAction() {
  const token = await readSessionToken();
  if (token) await logout(await getDb(), token);
  await clearSessionCookie();
  redirect("/login");
}
