import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, LayoutDashboard, MonitorSmartphone, MousePointerClick, Search } from "lucide-react";
import { Alert, Card, CardHead, EmptyState, Fact, Kpi, PageHeader, SkeletonCard } from "@/components/ui";
import { AddDeviceButton } from "@/components/add-device";
import { DeviceStatus, OnlineState, PLATFORM_LABEL, formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { deviceStats, getDevice, listDevices } from "@/server/services/devices";
import { ServiceError } from "@/server/services/errors";
import { getAccountSettings } from "@/server/services/account-settings";

export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        overline="Visão geral"
        title="Dashboard"
        description="Acompanhe os dispositivos da conta, cadastre novos e inspecione cada um."
        integration="connected"
        actions={<AddDeviceButton className="btn btn-primary" />}
      />
      <Suspense fallback={<SkeletonCard rows={2} />}>
        <Stats />
      </Suspense>
      <div className="grid grid-2">
        <Suspense fallback={<SkeletonCard rows={6} />}>
          <DevicesAndInspector searchParams={searchParams} />
        </Suspense>
        <HowToAdd />
      </div>
    </>
  );
}

async function Stats() {
  await requireAdmin();
  const db = await getDb();
  const [s, account] = await Promise.all([deviceStats(db), getAccountSettings(db)]);
  return (
    <>
    {account.maintenanceEnabled && (
      <Alert tone="warning">Modo manutenção ativo: os dispositivos estão pausados. <Link href="/manutencao">Gerenciar manutenção</Link></Alert>
    )}
    <div className="grid grid-kpi">
      <Kpi label="Dispositivos" value={s.total} hint="cadastrados na conta" />
      <Kpi label="Ativos" value={s.active} hint="com o app conectado" color="var(--color-green-500)" />
      <Kpi label="Aguardando" value={s.pending} hint="cadastrados, sem ativação" color="var(--color-yellow-400)" />
      <Kpi label="Online agora" value={s.online} hint="contato nos últimos 5 min" color="var(--color-blue-500)" />
    </div>
    </>
  );
}

async function DevicesAndInspector({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const selectedId = typeof sp.d === "string" ? sp.d : null;
  const db = await getDb();
  const devices = await listDevices(db, q);
  let selected: Awaited<ReturnType<typeof getDevice>> | null = null;
  if (selectedId) {
    try {
      selected = await getDevice(db, selectedId);
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    }
  }
  return (
    <div className="grid">
      <Card>
        <CardHead icon={MonitorSmartphone} overline="Dispositivos" title={`Dispositivos (${devices.length})`} description="Selecione uma linha para inspecionar." />
        <form className="table-tools" role="search">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <label htmlFor="q" className="sr-only">Buscar por apelido ou Device ID</label>
            <input id="q" name="q" defaultValue={q} className="input" placeholder="Buscar por apelido ou Device ID" />
          </div>
          <button className="btn btn-secondary">Buscar</button>
        </form>
        {devices.length === 0 ? (
          <EmptyState
            icon={MonitorSmartphone}
            title={q ? "Nenhum dispositivo encontrado" : "Nenhum dispositivo ainda"}
            text={q ? "Tente outro apelido ou Device ID." : "Cadastre o Device ID mostrado no app ou crie um código de ativação."}
            action={q ? undefined : <AddDeviceButton />}
          />
        ) : (
          <table className="table">
            <thead>
              <tr><th scope="col">Apelido</th><th scope="col">Device ID</th><th scope="col">Status</th><th scope="col">Conexão</th></tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} aria-selected={d.id === selectedId}>
                  <td><Link className="t-main" href={`/?d=${d.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} scroll={false}>{d.nickname}</Link></td>
                  <td data-label="Device ID" className="mono">{d.deviceId}</td>
                  <td data-label="Status"><DeviceStatus status={d.status} /></td>
                  <td data-label="Conexão"><OnlineState lastSeenAt={d.lastSeenAt} online={d.online} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <CardHead icon={MousePointerClick} overline="Inspetor" title={selected ? selected.nickname : "Selecione um dispositivo"} description={selected ? undefined : "Escolha uma linha da tabela para ver status, versão do app e perfil."}
          action={selected ? <Link href={`/dispositivos/${selected.id}`} className="btn btn-primary btn-sm">Abrir painel</Link> : undefined} />
        {selected && (
          <div className="card-body">
            <dl className="facts" style={{ margin: 0 }}>
              <Fact label="Status"><DeviceStatus status={selected.status} /></Fact>
              <Fact label="Plataforma">{PLATFORM_LABEL[selected.platform]}</Fact>
              <Fact label="Versão do app">{selected.appVersion ?? "—"}</Fact>
              <Fact label="Último contato">{formatDate(selected.lastSeenAt)}</Fact>
              <Fact label="Perfil">{selected.profile?.name ?? "Nenhum"}</Fact>
              <Fact label="Playlists">{selected.playlists.length}</Fact>
            </dl>
          </div>
        )}
      </Card>
    </div>
  );
}

function HowToAdd() {
  return (
    <Card>
      <CardHead icon={BookOpen} overline="Primeiros passos" title="Como conectar um dispositivo" />
      <div className="card-body">
        <ol className="steps">
          <li><div><strong>Abra o app no dispositivo</strong><span className="muted">Anote o Device ID mostrado na tela de ativação.</span></div></li>
          <li><div><strong>Cadastre aqui</strong><span className="muted">Use “Adicionar dispositivo” com o ID exato (diferencia maiúsculas).</span></div></li>
          <li><div><strong>Confirme no app</strong><span className="muted">O app recebe as playlists e o perfil na próxima consulta.</span></div></li>
        </ol>
        <p className="muted" style={{ marginBottom: 0 }}>
          Para várias TVs de uma vez, crie um <Link href="/codigos">código de ativação</Link>: o usuário digita o código no app e o dispositivo entra já configurado.
        </p>
      </div>
    </Card>
  );
}
