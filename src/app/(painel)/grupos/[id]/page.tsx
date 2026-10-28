import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Layers, MonitorSmartphone, Settings2 } from "lucide-react";
import { Alert, Card, CardHead, EmptyState, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { DeviceStatus } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getGroup } from "@/server/services/groups";
import { listDevices } from "@/server/services/devices";
import { listPlaylists } from "@/server/services/playlists";
import { listProfiles } from "@/server/services/profiles";
import { ServiceError } from "@/server/services/errors";
import { deleteGroupAction, removeFromGroupAction, setDeviceGroupAction, updateGroupAction } from "../../actions";
import { GroupFields } from "../group-fields";

export const metadata: Metadata = { title: "Grupo" };

export default function GroupPage(props: PageProps<"/grupos/[id]">) {
  return (
    <Suspense fallback={<SkeletonCard rows={8} />}>
      <Group {...props} />
    </Suspense>
  );
}

async function Group({ params }: PageProps<"/grupos/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const db = await getDb();
  let group;
  try {
    group = await getGroup(db, id);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  }
  const [profiles, playlists, devices] = await Promise.all([listProfiles(db), listPlaylists(db), listDevices(db)]);
  const outside = devices.filter((d) => !group.members.some((m) => m.id === d.id));

  return (
    <>
      <PageHeader
        icon={Layers}
        overline="Grupo de dispositivos"
        title={group.name}
        description={`${group.members.length} ${group.members.length === 1 ? "dispositivo" : "dispositivos"} neste grupo.`}
        integration="connected"
        actions={<Link href="/grupos" className="btn btn-on-dark"><ArrowLeft size={18} aria-hidden="true" /> Grupos</Link>}
      />
      <div className="grid grid-2">
        <Card>
          <CardHead icon={Settings2} overline="Configuração" title="Perfil e playlists do grupo" />
          <div className="card-body">
            <Alert tone="info">Ao salvar, o perfil e as playlists de todos os dispositivos do grupo são substituídos por estes.</Alert>
            <ActionForm action={updateGroupAction}>
              <input type="hidden" name="id" value={group.id} />
              <GroupFields
                prefix="edit-group"
                profiles={profiles.map(({ id, name, platform }) => ({ id, name, platform }))}
                playlists={playlists.map(({ id, name, type }) => ({ id, name, type }))}
                defaults={{ name: group.name, profileId: group.profileId, playlistIds: group.playlistIds }}
              />
              <div className="form-actions"><SubmitButton>Salvar e aplicar</SubmitButton></div>
            </ActionForm>
          </div>
        </Card>
        <div className="grid">
          <Card>
            <CardHead icon={MonitorSmartphone} overline="Membros" title="Dispositivos do grupo" />
            {group.members.length === 0 ? (
              <EmptyState icon={MonitorSmartphone} title="Nenhum dispositivo no grupo" text="Adicione um dispositivo abaixo ou crie um código de ativação ligado a este grupo." />
            ) : (
              <table className="table">
                <thead><tr><th scope="col">Apelido</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {group.members.map((m) => (
                    <tr key={m.id}>
                      <td><Link className="t-main" href={`/dispositivos/${m.id}`}>{m.nickname}</Link><div className="mono muted">{m.deviceId}</div></td>
                      <td data-label="Status"><DeviceStatus status={m.status} /></td>
                      <td className="t-actions">
                        <form action={removeFromGroupAction}>
                          <input type="hidden" name="deviceId" value={m.id} />
                          <button className="btn btn-secondary btn-sm">Remover do grupo</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {outside.length > 0 && (
              <div className="card-body" style={{ borderTop: "1px solid var(--color-border)" }}>
                <ActionForm action={setDeviceGroupAction}>
                  <input type="hidden" name="groupId" value={group.id} />
                  <div className="field">
                    <label htmlFor="add-member">Adicionar dispositivo</label>
                    <select id="add-member" name="deviceId" className="input" required defaultValue="">
                      <option value="" disabled>Escolha um dispositivo</option>
                      {outside.map((d) => <option key={d.id} value={d.id}>{d.nickname} ({d.deviceId})</option>)}
                    </select>
                    <p className="hint">Se ele estiver em outro grupo, muda para este.</p>
                  </div>
                  <div className="form-actions"><SubmitButton>Adicionar ao grupo</SubmitButton></div>
                </ActionForm>
              </div>
            )}
          </Card>
          <Card>
            <div className="card-body" style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div><strong>Excluir grupo</strong><div className="muted">Os dispositivos saem do grupo e mantêm a configuração atual.</div></div>
              <form action={deleteGroupAction}>
                <input type="hidden" name="id" value={group.id} />
                <ConfirmSubmit message={`Excluir o grupo “${group.name}”?`}>Excluir grupo</ConfirmSubmit>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
