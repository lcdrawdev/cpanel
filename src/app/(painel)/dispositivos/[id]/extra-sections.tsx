import Link from "next/link";
import { Camera, Copy, SlidersVertical } from "lucide-react";
import { Alert, Card, CardHead, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { formatDate } from "@/components/device-bits";
import { SETTING_GROUPS, resolveSettings, settingsSchema } from "@/shared/settings";
import type { getDevice } from "@/server/services/devices";
import type { listSnapshots } from "@/server/services/snapshots";
import type { listDevices } from "@/server/services/devices";
import {
  clearDeviceOverridesAction, copyDeviceAction, createSnapshotAction, restoreSnapshotAction, saveDeviceOverridesAction,
} from "../../actions";

type Device = Awaited<ReturnType<typeof getDevice>>;

/** Device-only settings on top of the profile (reference: device panel General/Advanced Settings). */
export function OverridesSection({ device }: { device: Device }) {
  const base = resolveSettings(device.profile?.settings);
  const overrides = settingsSchema.parse(device.settingsOverrides ?? {});
  const values = { ...base, ...overrides };
  const customized = Object.keys(overrides).length;
  return (
    <Card>
      <CardHead icon={SlidersVertical} overline="Só este dispositivo" title="Ajustes do dispositivo"
        description={device.profile ? `Base: perfil “${device.profile.name}”. Valores diferentes ficam guardados só para este dispositivo.` : "Sem perfil: a base são os padrões do app."} />
      <div className="card-body">
        {customized > 0 && (
          <Alert tone="info">
            {customized} ajuste(s) próprio(s) neste dispositivo, marcados com “personalizado”.
          </Alert>
        )}
        <ActionForm action={saveDeviceOverridesAction}>
          <input type="hidden" name="deviceId" value={device.id} />
          {SETTING_GROUPS.map((g) => (
            <div key={g.id} style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{g.title}</div>
              {g.fields.map((f) => {
                const id = `ovr-${f.key}`;
                const v = values[f.key as keyof typeof values];
                const isCustom = f.key in overrides;
                return (
                  <div key={f.key} className="setting">
                    <label className="s-text" htmlFor={id} style={{ cursor: "pointer" }}>
                      <strong>{f.label} {isCustom && <span className="pill pill-info" style={{ marginLeft: 6 }}>personalizado</span>}</strong>
                      <span>{f.help}</span>
                    </label>
                    {f.type === "boolean" && <input id={id} name={f.key} type="checkbox" className="switch" defaultChecked={Boolean(v)} />}
                    {f.type === "number" && <input id={id} name={f.key} type="number" className="input" min={f.min} max={f.max} defaultValue={Number(v)} style={{ minWidth: 100, width: 120 }} />}
                    {f.type === "select" && (
                      <select id={id} name={f.key} className="input" defaultValue={String(v)}>
                        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="form-actions"><SubmitButton>Salvar ajustes</SubmitButton></div>
        </ActionForm>
        {customized > 0 && (
          <form action={clearDeviceOverridesAction} className="form-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
            <input type="hidden" name="deviceId" value={device.id} />
            <button className="btn btn-secondary">Voltar tudo ao perfil</button>
          </form>
        )}
      </div>
    </Card>
  );
}

/** Snapshots and device-to-device copy (reference: Device snapshots / Copy one device to another). */
export function CopiesSection(props: {
  device: Device;
  snapshots: Awaited<ReturnType<typeof listSnapshots>>;
  devices: Awaited<ReturnType<typeof listDevices>>;
}) {
  const others = props.devices.filter((d) => d.id !== props.device.id);
  return (
    <>
      <Card>
        <CardHead icon={Camera} overline="Snapshots" title="Salvar a configuração atual" description="Guarda perfil, playlists e ajustes próprios deste dispositivo." action={<Link href="/snapshots" className="btn btn-secondary btn-sm">Ver snapshots</Link>} />
        <div className="card-body">
          <ActionForm action={createSnapshotAction} resetOnSuccess>
            <input type="hidden" name="deviceId" value={props.device.id} />
            <div className="field">
              <label htmlFor="snap-name">Nome do snapshot</label>
              <input id="snap-name" name="name" className="input" required maxLength={80} defaultValue={`${props.device.nickname} – ${formatDate(new Date())}`} />
            </div>
            <div className="form-actions"><SubmitButton>Salvar snapshot</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>
      <Card>
        <CardHead icon={Copy} overline="Aplicar neste dispositivo" title="Restaurar ou copiar" description="Substitui o perfil, as playlists e os ajustes próprios deste dispositivo." />
        <div className="card-body">
          {props.snapshots.length === 0 ? (
            <EmptyState icon={Camera} title="Nenhum snapshot salvo" text="Salve um snapshot de qualquer dispositivo para restaurar aqui." />
          ) : (
            <ActionForm action={restoreSnapshotAction}>
              <input type="hidden" name="deviceId" value={props.device.id} />
              <div className="field">
                <label htmlFor="snap-restore">Snapshot</label>
                <select id="snap-restore" name="snapshotId" className="input" required defaultValue="">
                  <option value="" disabled>Escolha um snapshot</option>
                  {props.snapshots.map((s) => <option key={s.id} value={s.id}>{s.name} (de {s.sourceNickname})</option>)}
                </select>
              </div>
              <div className="form-actions"><SubmitButton>Restaurar snapshot</SubmitButton></div>
            </ActionForm>
          )}
          {others.length > 0 && (
            <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 16, paddingTop: 16 }}>
              <ActionForm action={copyDeviceAction}>
                <input type="hidden" name="deviceId" value={props.device.id} />
                <div className="field">
                  <label htmlFor="copy-source">Copiar de outro dispositivo</label>
                  <select id="copy-source" name="sourceId" className="input" required defaultValue="">
                    <option value="" disabled>Escolha o dispositivo de origem</option>
                    {others.map((d) => <option key={d.id} value={d.id}>{d.nickname} ({d.deviceId})</option>)}
                  </select>
                </div>
                <div className="form-actions"><SubmitButton>Copiar configuração</SubmitButton></div>
              </ActionForm>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
