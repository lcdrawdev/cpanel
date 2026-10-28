import { Bell, KeyRound, Mail } from "lucide-react";
import { Alert, Card, CardHead, EmptyState, Pill } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { getAccountSettings } from "@/server/services/account-settings";
import { listApiKeys } from "@/server/services/integrations";
import { mailConfigured, recentNotifications } from "@/server/services/notifications";
import { createApiKeyAction, revokeApiKeyAction, saveNotificationPrefsAction, sendPendingNotificationsAction } from "../actions";

/** Account › Integrations: read-only API keys (reference: Account Configurations › Integrations). */
export async function IntegrationsSection() {
  const keys = await listApiKeys(await getDb());
  return (
    <div className="grid">
      <Card>
        <CardHead icon={KeyRound} overline="Integrações" title="Chaves de API" description="Acesso somente leitura a dispositivos e reportes por outros sistemas." />
        {keys.length === 0 ? (
          <EmptyState icon={KeyRound} title="Nenhuma chave criada" text="Crie uma chave para cada sistema que vai consultar o painel." />
        ) : (
          <table className="table">
            <thead><tr><th scope="col">Nome</th><th scope="col">Início da chave</th><th scope="col">Último uso</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td><span className="t-main">{k.name}</span></td>
                  <td data-label="Início" className="mono">{k.prefix}…</td>
                  <td data-label="Último uso">{formatDate(k.lastUsedAt)}</td>
                  <td data-label="Situação">{k.revokedAt ? <Pill tone="neutral">Revogada</Pill> : <Pill tone="success">Ativa</Pill>}</td>
                  <td className="t-actions">
                    {!k.revokedAt && (
                      <form action={revokeApiKeyAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <ConfirmSubmit message={`Revogar a chave “${k.name}”? Os sistemas que usam essa chave perdem o acesso.`}>Revogar</ConfirmSubmit>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="card-body" style={{ borderTop: "1px solid var(--color-border)" }}>
          <ActionForm action={createApiKeyAction} resetOnSuccess>
            <div className="field">
              <label htmlFor="key-name">Nome da chave</label>
              <input id="key-name" name="name" className="input" required maxLength={60} placeholder="Ex.: Integração financeiro" />
              <p className="hint">A chave completa aparece uma única vez, logo após criar. Guarde em local seguro.</p>
            </div>
            <div className="form-actions"><SubmitButton>Criar chave</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>
      <Card>
        <CardHead icon={KeyRound} overline="Como usar" title="Endpoints disponíveis" />
        <div className="card-body">
          <p style={{ marginTop: 0 }}>Envie o cabeçalho <code className="mono">Authorization: Bearer pak_…</code>:</p>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            <li><code className="mono">GET /api/v1/integration/devices?q=</code> lista de dispositivos</li>
            <li><code className="mono">GET /api/v1/integration/reports?status=open|resolved</code> reportes de canais</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { device_added: "Dispositivo adicionado", device_removed: "Dispositivo removido", channel_report: "Canal reportado" };

/** Account › Notifications: alert preferences and the outbox. */
export async function NotificationsSection() {
  const db = await getDb();
  const [s, recent] = await Promise.all([getAccountSettings(db), recentNotifications(db)]);
  const smtp = mailConfigured();
  const pending = recent.filter((n) => n.status === "pending").length;
  return (
    <div className="grid">
      <Card>
        <CardHead icon={Bell} overline="Notificações" title="Alertas por e-mail" description="Escolha para onde e quando os alertas são enviados." />
        <div className="card-body">
          {!smtp && (
            <Alert tone="warning">O envio de e-mail ainda não está configurado no servidor (SMTP). Os alertas ficam guardados na fila abaixo e saem assim que o SMTP for configurado.</Alert>
          )}
          <ActionForm action={saveNotificationPrefsAction}>
            <div className="field">
              <label htmlFor="notify-email">E-mail para alertas</label>
              <input id="notify-email" name="email" type="email" className="input" defaultValue={s.notifyEmail} placeholder="voce@exemplo.com" />
              <p className="hint">Em branco: nenhum alerta é gerado.</p>
            </div>
            {([
              ["deviceAdded", "Quando um dispositivo for adicionado", s.notifyDeviceAdded],
              ["deviceRemoved", "Quando um dispositivo for removido", s.notifyDeviceRemoved],
              ["channelReport", "Quando um canal for reportado", s.notifyChannelReport],
            ] as const).map(([name, title, checked]) => (
              <label key={name} className="setting" style={{ cursor: "pointer" }}>
                <span className="s-text"><strong>{title}</strong></span>
                <input type="checkbox" className="switch" name={name} defaultChecked={checked} />
              </label>
            ))}
            <div className="form-actions"><SubmitButton>Salvar</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>
      <Card>
        <CardHead icon={Mail} overline="Fila" title="Últimos alertas" description={smtp ? "Enviados automaticamente." : `${pending} pendente(s) aguardando SMTP.`}
          action={smtp && pending > 0 ? <form action={sendPendingNotificationsAction}><button className="btn btn-secondary btn-sm">Enviar pendentes</button></form> : undefined} />
        {recent.length === 0 ? (
          <EmptyState icon={Mail} title="Nenhum alerta ainda" text="Os alertas aparecem aqui quando os eventos escolhidos acontecerem." />
        ) : (
          <table className="table">
            <thead><tr><th scope="col">Assunto</th><th scope="col">Tipo</th><th scope="col">Para</th><th scope="col">Quando</th><th scope="col">Situação</th></tr></thead>
            <tbody>
              {recent.map((n) => (
                <tr key={n.id}>
                  <td><span className="t-main">{n.subject}</span></td>
                  <td data-label="Tipo">{KIND_LABEL[n.kind] ?? n.kind}</td>
                  <td data-label="Para">{n.email}</td>
                  <td data-label="Quando">{formatDate(n.createdAt)}</td>
                  <td data-label="Situação">{n.status === "sent" ? <Pill tone="success">Enviado</Pill> : n.status === "failed" ? <Pill tone="danger">Falhou</Pill> : <Pill tone="warning">Pendente</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
