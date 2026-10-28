import type { Metadata } from "next";
import Link from "next/link";
import { Cloud, KeyRound, ListVideo, MonitorSmartphone, Route, SlidersHorizontal } from "lucide-react";
import { Card, CardHead, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Gestão na nuvem" };

export default function ManagementGuidePage() {
  return (
    <>
      <PageHeader icon={Cloud} overline="Gestão na nuvem" title="Como funciona a gestão remota" description="Configure playlists e o player de cada dispositivo a partir do painel." integration="info"
        actions={<Link href="/dispositivos" className="btn btn-primary">Abrir dispositivos</Link>} />
      <div className="grid grid-2">
        <Card>
          <CardHead icon={Route} overline="Passo a passo" title="Do cadastro à configuração" />
          <div className="card-body">
            <ol className="steps">
              <li><div><strong>Cadastre o dispositivo</strong><span className="muted">Pelo Device ID (Dashboard → Adicionar dispositivo) ou deixando o usuário ativar com um código.</span></div></li>
              <li><div><strong>O app se ativa</strong><span className="muted">Ele recebe um token próprio. Bloquear o dispositivo revoga esse token.</span></div></li>
              <li><div><strong>Configure pelo painel</strong><span className="muted">Playlists, perfil de configurações e apelido.</span></div></li>
              <li><div><strong>O app busca a configuração</strong><span className="muted">Cada mudança aumenta a versão da configuração; o app consulta e aplica a nova versão.</span></div></li>
            </ol>
          </div>
        </Card>
        <Card>
          <CardHead icon={MonitorSmartphone} overline="Ferramentas" title="Onde fazer cada coisa" />
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <Link href="/dispositivos" className="section-link"><span className="sl-icon"><MonitorSmartphone size={18} /></span><span>Dispositivos<small>Inventário e painel de cada dispositivo</small></span></Link>
            <Link href="/codigos" className="section-link"><span className="sl-icon"><KeyRound size={18} /></span><span>Códigos de ativação<small>Cadastro em massa com limite de usos</small></span></Link>
            <Link href="/perfis" className="section-link"><span className="sl-icon"><SlidersHorizontal size={18} /></span><span>Perfis de configuração<small>Configurações reutilizáveis do player</small></span></Link>
            <Link href="/portais" className="section-link"><span className="sl-icon"><ListVideo size={18} /></span><span>Portais e playlists<small>Cadastro central com credenciais criptografadas</small></span></Link>
          </div>
        </Card>
      </div>
    </>
  );
}
