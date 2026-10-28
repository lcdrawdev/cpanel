import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Flag, Inbox } from "lucide-react";
import { Alert, Card, CardHead, EmptyState, Kpi, PageHeader, SkeletonCard } from "@/components/ui";
import { formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getAccountSettings } from "@/server/services/account-settings";
import { listReports, reportStats } from "@/server/services/reports";
import { setReportStatusAction } from "../actions";

export const metadata: Metadata = { title: "Reportes de canais" };

export default function ReportsPage(props: PageProps<"/reportes">) {
  return (
    <>
      <PageHeader
        icon={Flag}
        overline="Operação"
        title="Reportes de canais"
        description="Problemas em canais reportados pelos usuários, com o dispositivo e a playlist de origem."
        integration="connected"
      />
      <Suspense fallback={<SkeletonCard rows={6} />}>
        <Reports {...props} />
      </Suspense>
    </>
  );
}

async function Reports({ searchParams }: PageProps<"/reportes">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status === "resolvidos" ? "resolved" : "open";
  const db = await getDb();
  const [reports, stats, account] = await Promise.all([listReports(db, status), reportStats(db), getAccountSettings(db)]);
  return (
    <>
      {!account.channelReportsEnabled && (
        <Alert tone="warning">O reporte de canais está desligado: os apps não mostram a opção. <Link href="/gestao/configuracoes">Ativar em Políticas da conta</Link></Alert>
      )}
      <div className="grid grid-kpi">
        <Kpi label="Abertos" value={stats.open} hint="aguardando análise" color="var(--color-yellow-400)" />
        <Kpi label="Resolvidos" value={stats.resolved} hint="no histórico" color="var(--color-green-500)" />
        <Kpi label="Ordem" value="Mais recentes" hint="primeiro na fila" />
      </div>
      <Card>
        <CardHead
          icon={Inbox}
          overline="Fila"
          title={status === "open" ? "Reportes abertos" : "Reportes resolvidos"}
          action={
            <nav aria-label="Filtrar reportes" style={{ display: "flex", gap: 8 }}>
              <Link href="/reportes" className={`btn btn-sm ${status === "open" ? "btn-primary" : "btn-secondary"}`} aria-current={status === "open" ? "page" : undefined}>Abertos</Link>
              <Link href="/reportes?status=resolvidos" className={`btn btn-sm ${status === "resolved" ? "btn-primary" : "btn-secondary"}`} aria-current={status === "resolved" ? "page" : undefined}>Resolvidos</Link>
            </nav>
          }
        />
        {reports.length === 0 ? (
          <EmptyState icon={Inbox} title={status === "open" ? "Nenhum reporte aberto" : "Nenhum reporte resolvido"} text="Os reportes enviados pelos apps aparecem aqui automaticamente." />
        ) : (
          <table className="table">
            <thead><tr><th scope="col">Canal</th><th scope="col">Motivo</th><th scope="col">Dispositivo</th><th scope="col">Playlist</th><th scope="col">Quando</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td><span className="t-main">{r.channelName}</span></td>
                  <td data-label="Motivo">{r.reason}</td>
                  <td data-label="Dispositivo"><Link href={`/dispositivos/${r.deviceUuid}`}>{r.deviceNickname}</Link></td>
                  <td data-label="Playlist">{r.playlistName ?? <span className="muted">—</span>}</td>
                  <td data-label="Quando">{formatDate(status === "open" ? r.createdAt : r.resolvedAt)}</td>
                  <td className="t-actions">
                    <form action={setReportStatusAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={status === "open" ? "resolved" : "open"} />
                      <button className={`btn btn-sm ${status === "open" ? "btn-success" : "btn-secondary"}`}>{status === "open" ? "Marcar resolvido" : "Reabrir"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
