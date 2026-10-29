import { ServiceError } from "./services/errors";

// In-memory sliding windows (one panel process). Enough to stop guessing of passwords and codes;
// behind several processes a shared store (Redis/Postgres) would replace this.
const hits = new Map<string, number[]>();

/** Throws 429 when [key] was used [max] times in the last [windowMs]. */
export function rateLimit(key: string, max: number, windowMs: number, message = "Muitas tentativas. Aguarde um pouco e tente de novo.") {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new ServiceError("rate_limited", message, 429);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 50_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}

/** Forget the attempts of [key] (e.g. after a successful login). */
export function clearRateLimit(key: string) {
  hits.delete(key);
}

/** Client address from the proxy headers (cPanel/Apache/Nginx set X-Forwarded-For). */
export function clientIp(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}