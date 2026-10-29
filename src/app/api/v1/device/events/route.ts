import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { devices } from "@/server/db/schema";
import { authenticateDevice, configVersion, heartbeat } from "@/server/services/device-api";
import { apiError } from "@/server/http/device-route";

// Server-Sent Events: pushes the configuration version as soon as it changes, so the app
// refetches /config right away instead of waiting for its next poll.
const CHECK_MS = 2_000;
const KEEPALIVE_MS = 25_000;
// Vercel ends a function after this many seconds; the TV reconnects on its own (polling covers the gap).
export const maxDuration = 300;
// Connections are recycled; the app reconnects (EventSource does it automatically).
const MAX_LIFETIME_MS = process.env.VERCEL ? 280_000 : 10 * 60_000;

export async function GET(request: Request) {
  let device;
  try {
    device = await authenticateDevice(await getDb(), request.headers.get("authorization"));
  } catch (e) {
    return apiError(e);
  }
  const deviceUuid = device.id;
  const encoder = new TextEncoder();
  let timers: ReturnType<typeof setInterval>[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const db = await getDb();
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };
      const stop = () => {
        timers.forEach(clearInterval);
        timers = [];
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      let last = await configVersion(db, device);
      send(`retry: 5000\nevent: version\ndata: ${JSON.stringify({ version: last })}\n\n`);
      await heartbeat(db, deviceUuid, {});

      timers.push(
        setInterval(async () => {
          const current = await db.query.devices.findFirst({ where: eq(devices.id, deviceUuid) });
          // Blocked or removed devices lose the stream immediately.
          if (!current || current.status !== "active") {
            send(`event: revoked\ndata: {}\n\n`);
            return stop();
          }
          const version = await configVersion(db, current);
          if (version !== last) {
            last = version;
            send(`event: version\ndata: ${JSON.stringify({ version })}\n\n`);
          }
        }, CHECK_MS),
        setInterval(() => {
          send(`: keepalive\n\n`);
          void heartbeat(db, deviceUuid, {});
        }, KEEPALIVE_MS),
      );
      const lifetime = setTimeout(stop, MAX_LIFETIME_MS);
      request.signal.addEventListener("abort", () => {
        clearTimeout(lifetime);
        stop();
      });
    },
    cancel() {
      timers.forEach(clearInterval);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
