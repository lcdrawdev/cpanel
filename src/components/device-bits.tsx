import { Pill } from "./ui";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function formatDate(d: Date | null | undefined) {
  return d ? dateFmt.format(d) : "—";
}

export function DeviceStatus({ status }: { status: "pending" | "active" | "blocked" }) {
  if (status === "active") return <Pill tone="success">Ativo</Pill>;
  if (status === "blocked") return <Pill tone="danger">Bloqueado</Pill>;
  return <Pill tone="warning">Aguardando ativação</Pill>;
}

export function OnlineState({ lastSeenAt, online }: { lastSeenAt: Date | null; online: boolean }) {
  if (!lastSeenAt) return <span className="muted">Nunca conectou</span>;
  return online ? <Pill tone="info">Online</Pill> : <span className="muted">Visto em {formatDate(lastSeenAt)}</span>;
}

export const PLATFORM_LABEL: Record<string, string> = {
  android_tv: "Android TV",
  android_mobile: "Android",
  apple: "iOS / tvOS",
  tizen: "Samsung Tizen",
  webos: "LG webOS",
  roku: "Roku",
  other: "Outro",
};

export const PROFILE_PLATFORM_LABEL: Record<string, string> = { tv: "TV (Android)", mobile: "Celular (Android)", apple: "iOS e tvOS" };
