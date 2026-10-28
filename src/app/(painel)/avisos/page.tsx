import type { Metadata } from "next";
import { Suspense } from "react";
import { Bell, Send } from "lucide-react";
import { Card, CardHead, EmptyState, PageHeader, Pill, SkeletonCard } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { listMessages } from "@/server/services/messages";
import { createMessageAction, deleteMessageAction } from "../actions";

export const metadata: Metadata = { title: "Avisos" };

export default function MessagesPage() {
  return (
    <>
      <PageHeader
        icon={Bell}
        overline="App da TV"
        title="Avisos"
        description="Mensagens que aparecem no sino do app: para todos, para um grupo ou para um dispositivo."
        integration="connected"
      />
      <Suspense fallback={<SkeletonCard rows={6} />}>
        <Messages />
      </Suspense>
    </>
  );
}

async function Messages() {
  await requireAdmin();
  const db = await getDb();
  const [messages, groups, devices] = await Promise.all([
    listMessages(db),
    db.query.deviceGroups.findMany({ orderBy: (g, { asc }) => asc(g.name) }),
    db.query.devices.findMany({ orderBy: (d, { asc }) => asc(d.nickname) }),
  ]);
  return (
    <>
      <Card>
        <CardHead icon={Send} overline="Novo aviso" title="Enviar aviso" description="Os aparelhos recebem na hora (tempo real) e mostram um ponto no sino." />
        <div className="card-body">
          <ActionForm action={createMessageAction} resetOnSuccess>
            <div className="field">
              <label htmlFor="title">Título</label>
              <input id="title" name="title" className="input" maxLength={80} required placeholder="Ex.: Manutenção programada" />
            </div>
            <div className="field">
              <label htmlFor="body">Mensagem</label>
              <textarea id="body" name="body" className="input" rows={3} maxLength={1000} required placeholder="Ex.: Domingo, das 2h às 4h, alguns canais podem ficar fora do ar." />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="target">Para quem</label>
                <select id="target" name="target" className="input" defaultValue="all">
                  <option value="all">Todos os dispositivos</option>
                  <option value="group">Um grupo</option>
                  <option value="device">Um dispositivo</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="groupId">Grupo (se escolheu grupo)</label>
                <select id="groupId" name="groupId" className="input" defaultValue="">
                  <option value="">—</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="deviceId">Dispositivo (se escolheu um)</label>
                <select id="deviceId" name="deviceId" className="input" defaultValue="">
                  <option value="">—</option>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.nickname}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="days">Some depois de (dias)</label>
                <input id="days" name="days" type="number" min={0} max={365} defaultValue={7} className="input" />
                <p className="hint">0 = não expira.</p>
              </div>
            </div>
            <div className="form-actions"><SubmitButton>Enviar aviso</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>

      <Card>
        <CardHead icon={Bell} overline="Enviados" title="Avisos ativos e antigos" />
        {messages.length === 0 ? (
          <div className="card-body"><EmptyState icon={Bell} title="Nenhum aviso" text="Os avisos enviados aparecem aqui." /></div>
        ) : (
          <table className="table">
            <thead><tr><th>Aviso</th><th>Para</th><th>Enviado</th><th>Validade</th><th /></tr></thead>
            <tbody>
              {messages.map((m) => {
                const expired = m.expiresAt !== null && m.expiresAt < new Date();
                return (
                  <tr key={m.id}>
                    <td><strong>{m.title}</strong><div className="hint">{m.body}</div></td>
                    <td>{m.deviceName ?? (m.groupName ? `Grupo ${m.groupName}` : "Todos")}</td>
                    <td>{formatDate(m.createdAt)}</td>
                    <td>{m.expiresAt ? <Pill tone={expired ? "neutral" : "success"}>{expired ? "Expirado" : `Até ${formatDate(m.expiresAt)}`}</Pill> : <Pill tone="success">Sem prazo</Pill>}</td>
                    <td>
                      <form action={deleteMessageAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <ConfirmSubmit message={`Excluir o aviso "${m.title}"? Ele some dos aparelhos.`}>Excluir</ConfirmSubmit>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
