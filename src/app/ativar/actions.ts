"use server";

import { headers } from "next/headers";
import { getDb } from "@/server/db/client";
import { confirmPairing } from "@/server/services/pairing";
import { ServiceError } from "@/server/services/errors";
import type { ActionResult } from "@/components/forms";

export async function activateAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  try {
    const r = await confirmPairing(await getDb(), String(form.get("mac") ?? ""), String(form.get("code") ?? ""), ip);
    return { ok: `Pronto! ${r.nickname} foi ativado. Volte para a TV: o aplicativo abre sozinho em alguns segundos.` };
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
}