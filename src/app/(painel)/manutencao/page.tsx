import type { Metadata } from "next";
import { Suspense } from "react";
import { SlidersHorizontal, Wrench } from "lucide-react";
import { Alert, Card, CardHead, Kpi, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getAccountSettings } from "@/server/services/account-settings";
import { saveMaintenanceAction } from "../actions";

export const metadata: Metadata = { title: "Modo manutenção" };

export default function MaintenancePage() {
  return (
    <>
      <PageHeader
        icon={Wrench}
        overline="Gestão na nuvem"
        title="Modo manutenção"
        description="Pause todos os dispositivos e mostre uma mensagem com uma linha de suporte."
        integration="connected"
      />
      <Suspense fallback={<SkeletonCard rows={6} />}>
        <Maintenance />
      </Suspense>
    </>
  );
}

async function Maintenance() {
  await requireAdmin();
  const s = await getAccountSettings(await getDb());
  return (
    <>
      <div className="grid grid-kpi">
        <Kpi label="Estado atual" value={s.maintenanceEnabled ? "Em manutenção" : "Disponível"} hint="todos os dispositivos" color={s.maintenanceEnabled ? "var(--color-yellow-400)" : "var(--color-green-500)"} />
        <Kpi label="Mensagem principal" value={s.maintenanceMessage.length} hint="de 1000 caracteres" />
        <Kpi label="Linha de suporte" value={s.maintenanceSupportLine.length} hint="de 100 caracteres" />
      </div>
      <Card>
        <CardHead icon={SlidersHorizontal} overline="Configuração" title="Experiência de manutenção" description="Estado e textos exibidos no app." />
        <div className="card-body">
          {s.maintenanceEnabled && <Alert tone="warning">O modo manutenção está ativo: os usuários não conseguem usar o app.</Alert>}
          <ActionForm action={saveMaintenanceAction}>
            <label className="setting" style={{ cursor: "pointer" }}>
              <span className="s-text"><strong>Ativar modo manutenção</strong><span>Enquanto ativo, o app mostra só a mensagem abaixo.</span></span>
              <input type="checkbox" className="switch" name="enabled" defaultChecked={s.maintenanceEnabled} />
            </label>
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="message">Mensagem principal</label>
              <textarea id="message" name="message" className="input" rows={4} maxLength={1000} defaultValue={s.maintenanceMessage} placeholder="Ex.: Estamos em manutenção. Voltamos às 14h." />
              <p className="hint">Obrigatória para ativar. Até 1000 caracteres.</p>
            </div>
            <div className="field">
              <label htmlFor="supportLine">Linha de suporte</label>
              <input id="supportLine" name="supportLine" className="input" maxLength={100} defaultValue={s.maintenanceSupportLine} placeholder="Ex.: Dúvidas: WhatsApp (00) 00000-0000" />
              <p className="hint">Texto curto no rodapé da tela de manutenção. Até 100 caracteres.</p>
            </div>
            <div className="form-actions"><SubmitButton>Aplicar</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>
    </>
  );
}
