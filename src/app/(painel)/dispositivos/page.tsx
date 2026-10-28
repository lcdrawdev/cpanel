import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MonitorSmartphone, Search, SlidersHorizontal } from "lucide-react";
import { Card, CardHead, EmptyState, PageHeader, SkeletonCard } from "@/components/ui";
import { AddDeviceButton } from "@/components/add-device";
import { DeviceStatus, OnlineState, PLATFORM_LABEL } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { listDevices } from "@/server/services/devices";

export const metadata: Metadata = { title: "Dispositivos" };

export default function DevicesPage({ searchParams }: PageProps<"/dispositivos">) {
  return (
    <>
      <PageHeader
        icon={MonitorSmartphone}
        overline="Gestão na nuvem"
        title="Dispositivos"
        description="Inventário central: busque, configure ou abra o painel de cada dispositivo."
        integration="connected"
        actions={<AddDeviceButton />}
      />
      <Suspense fallback={<SkeletonCard rows={8} />}>
        <DeviceTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function DeviceTable({ searchParams }: { searchParams: PageProps<"/dispositivos">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const devices = await listDevices(await getDb(), q);
  return (
    <Card>
      <CardHead icon={MonitorSmartphone} overline="Gestão na nuvem" title="Todos os dispositivos" description={`${devices.length} ${devices.length === 1 ? "dispositivo" : "dispositivos"}`} />
      <form className="table-tools" role="search">
        <div className="search">
          <Search size={16} aria-hidden="true" />
          <label htmlFor="q" className="sr-only">Buscar por apelido, Device ID ou perfil</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Buscar por apelido, Device ID ou perfil" />
        </div>
        <button className="btn btn-secondary">Buscar</button>
      </form>
      {devices.length === 0 ? (
        <EmptyState icon={MonitorSmartphone} title={q ? "Nenhum resultado" : "Nenhum dispositivo cadastrado"} text={q ? "Ajuste a busca." : "Adicione um Device ID ou ative pelo app com um código."} action={q ? undefined : <AddDeviceButton />} />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Apelido</th><th scope="col">Device ID</th><th scope="col">Plataforma</th><th scope="col">Perfil</th><th scope="col">Status</th><th scope="col">Conexão</th>
              <th scope="col"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td><Link className="t-main" href={`/dispositivos/${d.id}`}>{d.nickname}</Link></td>
                <td data-label="Device ID" className="mono">{d.deviceId}</td>
                <td data-label="Plataforma">{PLATFORM_LABEL[d.platform]}</td>
                <td data-label="Perfil">{d.profileName ?? <span className="muted">Nenhum</span>}</td>
                <td data-label="Status"><DeviceStatus status={d.status} /></td>
                <td data-label="Conexão"><OnlineState lastSeenAt={d.lastSeenAt} online={d.online} /></td>
                <td className="t-actions">
                  <Link href={`/dispositivos/${d.id}`} className="btn btn-success btn-sm"><SlidersHorizontal size={16} aria-hidden="true" /> Painel</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
