// Simula um app de TV falando com a API de dispositivo do painel.
// Uso: node scripts/simulate-device.mjs --device <deviceId> [--code ABC123XY] [--url http://localhost:3000] [--polls 3]
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => (cur.startsWith("--") ? [...acc, [cur.slice(2), arr[i + 1]]] : acc), []),
);
const base = args.url ?? "http://localhost:3000";
const deviceId = args.device ?? `sim-${Math.random().toString(16).slice(2, 14)}`;
const polls = Number(args.polls ?? 3);
const intervalMs = Number(args.interval ?? 5000);

async function call(path, init = {}) {
  const res = await fetch(`${base}/api/v1/device/${path}`, { ...init, headers: { "content-type": "application/json", ...init.headers } });
  const body = res.status === 304 ? null : await res.json();
  return { status: res.status, body, etag: res.headers.get("etag") };
}

const act = await call("activate", { method: "POST", body: JSON.stringify({ deviceId, code: args.code, platform: "android_tv", appVersion: "0.1.0-sim", model: "Simulador" }) });
if (act.status !== 200) {
  console.error(`Ativação falhou (${act.status}):`, act.body?.error?.message);
  process.exit(1);
}
console.log(`Ativado como "${act.body.config.device.nickname}" (Device ID ${deviceId}), configuração v${act.body.config.version}`);
console.log(`Playlists: ${act.body.config.playlists.map((p) => `${p.name} [${p.type}]`).join(", ") || "nenhuma"}`);
// Token e senhas não são impressos para não vazarem em logs.

let etag = `"${act.body.config.version}"`;
for (let i = 1; i <= polls; i++) {
  await new Promise((r) => setTimeout(r, intervalMs));
  const r = await call("config", { headers: { authorization: `Bearer ${act.body.token}`, "if-none-match": etag } });
  if (r.status === 304) console.log(`Consulta ${i}: sem mudanças`);
  else if (r.status === 200) {
    etag = r.etag;
    console.log(`Consulta ${i}: NOVA configuração v${r.body.version} · playlists=${r.body.playlists.length} · relógio24h=${r.body.settings.clock24h} · manutenção=${r.body.account?.maintenance?.enabled ? "ATIVA" : "não"}`);
  } else {
    console.log(`Consulta ${i}: ${r.status} ${r.body?.error?.message ?? ""}`);
    break;
  }
}

// --report "Nome do canal" envia um reporte de canal pela API (para testar a fila de reportes).
if (args.report) {
  const r = await call("reports", { method: "POST", headers: { authorization: `Bearer ${act.body.token}` }, body: JSON.stringify({ channelName: args.report, reason: args.reason ?? "Sem imagem", playlistId: act.body.config.playlists[0]?.id }) });
  console.log(`Reporte "${args.report}": ${r.status} ${r.body?.alreadyReported ? "já reportado" : r.body?.error?.message ?? "registrado"}`);
}

// --sse <segundos> escuta /events e imprime cada nova versão (tempo real).
if (args.sse) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), Number(args.sse) * 1000);
  try {
    const res = await fetch(`${base}/api/v1/device/events`, { headers: { authorization: `Bearer ${act.body.token}` }, signal: ctrl.signal });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    console.log(`SSE conectado (${res.status}), ouvindo por ${args.sse}s…`);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) if (line.startsWith("data:") || line.startsWith("event:")) console.log(`SSE ${new Date().toLocaleTimeString("pt-BR")} ${line}`);
    }
  } catch (e) {
    if (e.name !== "AbortError") throw e;
  }
}
