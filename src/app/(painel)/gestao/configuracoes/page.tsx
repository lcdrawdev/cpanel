import type { Metadata } from "next";
import { Suspense } from "react";
import { Building2, Flag, Shield } from "lucide-react";
import { Card, CardHead, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getAccountSettings } from "@/server/services/account-settings";
import { savePoliciesAction } from "../../actions";

export const metadata: Metadata = { title: "Políticas da conta" };

export default function PoliciesPage() {
  return (
    <>
      <PageHeader
        icon={Shield}
        overline="Gestão na nuvem"
        title="Políticas da conta"
        description="Regras e textos que valem para todos os dispositivos da conta."
        integration="connected"
      />
      <Suspense fallback={<SkeletonCard rows={8} />}>
        <Policies />
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

async function Policies() {
  await requireAdmin();
  const s = await getAccountSettings(await getDb());
  // One form, two cards, like the reference "Management Settings" page.
  return (
    <ActionForm action={savePoliciesAction} className="grid grid-2">
      <Card>
        <CardHead icon={Flag} overline="Fluxo de feedback" title="Reporte de canais" description="Permite que o usuário avise sobre um canal com problema durante a reprodução." />
        <div className="card-body">
          <Toggle name="channelReportsEnabled" title="Ativar reporte de canais" text="No app, segurar o botão OK durante a reprodução abre o reporte." checked={s.channelReportsEnabled} />
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="alreadyReportedMessage">Mensagem de canal já reportado</label>
            <textarea id="alreadyReportedMessage" name="alreadyReportedMessage" className="input" rows={3} maxLength={1000} defaultValue={s.alreadyReportedMessage} placeholder="Ex.: Obrigado! Esse canal já foi reportado e está em análise." />
            <p className="hint">Mostrada quando alguém reporta um canal que já tem reporte aberto.</p>
          </div>
        </div>
      </Card>
      <Card>
        <CardHead icon={Building2} overline="Política da organização" title="Identidade e regras" description="Aplicadas a todos os dispositivos." />
        <div className="card-body">
          <Toggle name="forceUpdates" title="Forçar atualizações do app" text="O usuário não pode pular atualizações importantes." checked={s.forceUpdates} />
          <Toggle name="disableCloudBackups" title="Desativar backup em nuvem" text="Impede o backup de configurações dentro do app." checked={s.disableCloudBackups} />
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="accountNickname">Apelido da conta</label>
            <input id="accountNickname" name="accountNickname" className="input" maxLength={60} defaultValue={s.accountNickname} placeholder="Ex.: Suporte Exemplo" />
            <p className="hint">Mostrado no app no lugar do e-mail da conta.</p>
          </div>
          <div className="field">
            <label htmlFor="supportUrl">Link de suporte</label>
            <input id="supportUrl" name="supportUrl" type="url" className="input" maxLength={300} defaultValue={s.supportUrl} placeholder="https://..." />
          </div>
          <div className="field">
            <label htmlFor="welcomeMessage">Mensagem de boas-vindas</label>
            <textarea id="welcomeMessage" name="welcomeMessage" className="input" rows={3} maxLength={1000} defaultValue={s.welcomeMessage} />
            <p className="hint">Mostrada uma vez quando um novo dispositivo termina a configuração.</p>
          </div>
        </div>
      </Card>
      <div className="form-actions" style={{ gridColumn: "1 / -1" }}><SubmitButton>Salvar políticas</SubmitButton></div>
    </ActionForm>
  );
}
