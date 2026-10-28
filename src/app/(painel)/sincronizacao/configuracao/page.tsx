import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MonitorSmartphone, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Alert, Card, CardHead, EmptyState, Kpi, PageHeader, Pill, SkeletonCard } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DeviceStatus, PLATFORM_LABEL } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getSyncState } from "@/server/services/sync";
import { listProfiles } from "@/server/services/profiles";
import { saveSyncConfigAction, setDeviceSyncAction } from "../../actions";

export const metadata: Metadata = { title: "Configuração da sincronização" };

export default function SyncConfigPage() {
  return (
    <>
      <PageHeader icon={RefreshCw} overline="Sincronização" title="Configuração" integration="connected"
        description="Ligue a sincronização da conta, escolha os tipos de dado e os dispositivos participantes." />
      <Suspense fallback={<SkeletonCard rows={8} />}>
        <SyncConfig />
      </Suspense>
    </>
  );
}

function Toggle({ name, title, text, checked }: { name: string; title: string; text: string; checked: boolean }) {
  return (
    <label className="setting" style={{ cursor: "pointer" }}>
      <span className="s-text"><strong>{title}</strong><span>{text}</span></span>
      <input type="checkbox" className="switch" name={name} defaultChecked={checked} />
    </label>
  );
}

async function SyncConfig() {
  await requireAdmin();
  const db = await getDb();
  const [state, profiles] = await Promise.all([getSyncState(db), listProfiles(db)]);
  const a = state.account;
  const participants = state.devices.filter((d) => d.syncEnabled).length;
  return (
    <>
      <div className="grid grid-kpi">
        <Kpi label="Sincronização" value={a.syncEnabled ? "Ativa" : "Desligada"} hint="chave geral da conta" color={a.syncEnabled ? "var(--color-green-500)" : "var(--color-border-strong)"} />
        <Kpi label="Participantes" value={participants} hint={`de ${state.devices.length} dispositivos`} />
        <Kpi label="Playlists no pool" value={state.poolPlaylistIds.length} hint="compartilhadas" />
        <Kpi label="Favoritos" value={state.favorites.length} hint="canais compartilhados" />
      </div>
      <div className="grid grid-2">
        <Card>
          <CardHead icon={SlidersHorizontal} overline="Conta" title="Dados sincronizados" description="Valem para todos os dispositivos participantes." />
          <div className="card-body">
            {!a.syncEnabled && <Alert tone="info">Com a chave geral desligada, as escolhas abaixo ficam guardadas mas não são aplicadas.</Alert>}
            <ActionForm action={saveSyncConfigAction}>
              <Toggle name="enabled" title="Sincronização da conta" text="Chave geral: liga ou desliga para todos os participantes." checked={a.syncEnabled} />
              <Toggle name="playlists" title="Playlists" text="Soma as playlists do pool às de cada participante." checked={a.syncPlaylists} />
              <Toggle name="favorites" title="Favoritos" text="Favoritos da TV ao vivo compartilhados." checked={a.syncFavorites} />
              <Toggle name="settings" title="Configurações do player" text="Um perfil único substitui o perfil de cada participante." checked={a.syncSettings} />
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="sync-profile">Perfil compartilhado</label>
                <select id="sync-profile" name="profileId" className="input" defaultValue={a.syncProfileId ?? ""}>
                  <option value="">Nenhum</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="hint">Obrigatório quando “Configurações do player” está ligado.</p>
              </div>
              <div className="form-actions"><SubmitButton>Salvar</SubmitButton></div>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHead icon={MonitorSmartphone} overline="Participantes" title="Dispositivos na sincronização" action={<Link href="/sincronizacao/dados" className="btn btn-secondary btn-sm">Dados</Link>} />
          {state.devices.length === 0 ? (
            <EmptyState icon={MonitorSmartphone} title="Nenhum dispositivo" text="Cadastre dispositivos para escolher quem participa." />
          ) : (
            <table className="table">
              <thead><tr><th scope="col">Dispositivo</th><th scope="col">Sincronização</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {state.devices.map((d) => (
                  <tr key={d.id}>
                    <td><Link className="t-main" href={`/dispositivos/${d.id}`}>{d.nickname}</Link><div className="muted">{PLATFORM_LABEL[d.platform]} · <DeviceStatus status={d.status} /></div></td>
                    <td data-label="Sincronização">{d.syncEnabled ? <Pill tone="success">Participa</Pill> : <Pill tone="neutral">Fora</Pill>}</td>
                    <td className="t-actions">
                      <form action={setDeviceSyncAction}>
                        <input type="hidden" name="deviceId" value={d.id} />
                        <input type="hidden" name="enabled" value={String(!d.syncEnabled)} />
                        <button className={`btn btn-sm ${d.syncEnabled ? "btn-secondary" : "btn-primary"}`}>{d.syncEnabled ? "Tirar" : "Incluir"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
