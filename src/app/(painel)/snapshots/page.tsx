import type { Metadata } from "next";
import { Suspense } from "react";
import { Camera } from "lucide-react";
import { Card, CardHead, EmptyState, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { listDevices } from "@/server/services/devices";
import { listSnapshots } from "@/server/services/snapshots";
import { deleteSnapshotAction, restoreSnapshotAction } from "../actions";

export const metadata: Metadata = { title: "Snapshots" };

export default function SnapshotsPage() {
  return (
    <>
      <PageHeader icon={Camera} overline="Gestão na nuvem" title="Snapshots de dispositivos" integration="connected"
        description="Configurações salvas (perfil, playlists e ajustes próprios) para restaurar em qualquer dispositivo." />
      <Suspense fallback={<SkeletonCard rows={6} />}>
        <Snapshots />
      </Suspense>
    </>
  );
}

async function Snapshots() {
  await requireAdmin();
  const db = await getDb();
  const [snapshots, devices] = await Promise.all([listSnapshots(db), listDevices(db)]);
  return (
    <Card>
      <CardHead icon={Camera} overline="Inventário" title="Snapshots salvos" description="Para criar um, abra o painel do dispositivo › Snapshots e cópia." />
      {snapshots.length === 0 ? (
        <EmptyState icon={Camera} title="Nenhum snapshot ainda" text="Abra um dispositivo, vá em “Snapshots e cópia” e salve a configuração atual." />
      ) : (
        <table className="table">
          <thead><tr><th scope="col">Nome</th><th scope="col">Origem</th><th scope="col">Conteúdo</th><th scope="col">Criado</th><th scope="col">Restaurar em</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td><span className="t-main">{s.name}</span></td>
                <td data-label="Origem">{s.sourceNickname}</td>
                <td data-label="Conteúdo">{s.data.playlistIds.length} playlist(s){s.data.profileId ? " · perfil" : ""}{Object.keys(s.data.settingsOverrides).length ? ` · ${Object.keys(s.data.settingsOverrides).length} ajuste(s)` : ""}</td>
                <td data-label="Criado">{formatDate(s.createdAt)}</td>
                <td data-label="Restaurar em">
                  <ActionForm action={restoreSnapshotAction}>
                    <input type="hidden" name="snapshotId" value={s.id} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <label htmlFor={`restore-${s.id}`} className="sr-only">Dispositivo de destino</label>
                      <select id={`restore-${s.id}`} name="deviceId" className="input" required defaultValue="" style={{ minWidth: 160 }}>
                        <option value="" disabled>Dispositivo…</option>
                        {devices.map((d) => <option key={d.id} value={d.id}>{d.nickname}</option>)}
                      </select>
                      <SubmitButton className="btn-sm">Aplicar</SubmitButton>
                    </div>
                  </ActionForm>
                </td>
                <td className="t-actions">
                  <form action={deleteSnapshotAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <ConfirmSubmit message={`Excluir o snapshot “${s.name}”?`}>Excluir</ConfirmSubmit>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
