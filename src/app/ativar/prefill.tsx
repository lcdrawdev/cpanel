"use client";

import { useEffect } from "react";

/** The QR code on the TV opens /ativar?mac=…&code=…: fill the two fields from the address (the page itself stays static). */
export function Prefill() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const mac = (q.get("mac") ?? "").replace(/[^0-9A-Fa-f:]/g, "").slice(0, 17);
    const code = (q.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
    const set = (id: string, v: string) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el && v && !el.value) el.value = v; };
    set("mac", mac);
    set("code", code);
  }, []);
  return null;
}