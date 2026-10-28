import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ServiceError } from "../services/errors";

/** JSON error envelope for the device API: `{ error: { code, message } }`. */
export function apiError(e: unknown) {
  if (e instanceof ServiceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: { code: "invalid_request", message: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } }, { status: 400 });
  if (e instanceof SyntaxError) return NextResponse.json({ error: { code: "invalid_json", message: "Corpo JSON inválido." } }, { status: 400 });
  console.error("device api error", e);
  return NextResponse.json({ error: { code: "internal", message: "Erro interno." } }, { status: 500 });
}

export const noStore = { "Cache-Control": "no-store" };
