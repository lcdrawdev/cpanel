import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Bell, CircleUser, KeyRound, Shield, UserCog } from "lucide-react";
import { Card, CardHead, Fact, PageHeader, SkeletonCard } from "@/components/ui";
import { IntegrationsSection, NotificationsSection } from "./account-extra";
import { ActionForm, SubmitButton } from "@/components/forms";
import { requireAdmin } from "@/server/session";
import { changePasswordAction } from "../actions";
import { logoutAction } from "../../(auth)/actions";

export const metadata: Metadata = { title: "Conta" };

// Sections follow "Account › Configurations" of the reference panel (MAPA_DE_TELAS 5–8).
const SECTIONS = [
  { id: "geral", label: "Geral", hint: "Identidade da conta", icon: CircleUser },
  { id: "seguranca", label: "Segurança", hint: "Senha", icon: Shield },
  { id: "integracoes", label: "Integrações", hint: "Chaves de API", icon: KeyRound },
  { id: "notificacoes", label: "Notificações", hint: "Alertas por e-mail", icon: Bell },
] as const;

export default function AccountPage(props: PageProps<"/conta">) {
  return (
    <>
      <PageHeader icon={UserCog} overline="Conta" title="Configurações da conta" description="Identidade, segurança e preferências do administrador." integration="connected" />
      <Suspense fallback={<SkeletonCard rows={4} />}>
        <Account {...props} />
      </Suspense>
    </>
  );
}

async function Account({ searchParams }: PageProps<"/conta">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const section = SECTIONS.find((s) => s.id === sp.secao) ?? SECTIONS[0];
  return (
    <div className="split">
      <nav className="card section-menu" aria-label="Seções da conta">
        <div className="sm-label eyebrow">Configurações</div>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.id} href={`/conta?secao=${s.id}`} className="section-link" aria-current={s.id === section.id ? "page" : undefined} scroll={false}>
              <span className="sl-icon" aria-hidden="true"><Icon size={18} /></span>
              <span>{s.label}<small>{s.hint}</small></span>
            </Link>
          );
        })}
      </nav>
      {section.id === "geral" && (
        <Card>
          <CardHead icon={CircleUser} overline="Conta" title="Geral" description="Dados do administrador conectado." />
          <div className="card-body">
            <dl className="facts" style={{ margin: 0 }}>
              <Fact label="Nome">{admin.name}</Fact>
              <Fact label="E-mail">{admin.email}</Fact>
            </dl>
            <form action={logoutAction} className="form-actions">
              <button className="btn btn-danger">Sair da conta</button>
            </form>
          </div>
        </Card>
      )}
      {section.id === "seguranca" && (
        <Card>
          <CardHead icon={Shield} overline="Proteção" title="Trocar senha" description="Ao trocar a senha, todas as sessões abertas são encerradas." />
          <div className="card-body">
            <ActionForm action={changePasswordAction}>
              <div className="field">
                <label htmlFor="current">Senha atual</label>
                <input id="current" name="current" type="password" className="input" autoComplete="current-password" required />
              </div>
              <div className="field">
                <label htmlFor="next">Nova senha</label>
                <input id="next" name="next" type="password" className="input" autoComplete="new-password" minLength={10} required />
                <p className="hint">Mínimo de 10 caracteres.</p>
              </div>
              <div className="field">
                <label htmlFor="confirm">Confirmar nova senha</label>
                <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={10} required />
              </div>
              <div className="form-actions"><SubmitButton>Trocar senha</SubmitButton></div>
            </ActionForm>
          </div>
        </Card>
      )}
      {section.id === "integracoes" && <IntegrationsSection />}
      {section.id === "notificacoes" && <NotificationsSection />}
    </div>
  );
}
