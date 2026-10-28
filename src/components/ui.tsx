import type { ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

export type Integration = "connected" | "demo" | "info";

/** Every page declares whether it is wired to the backend (rule from the project brief). */
export function IntegrationBadge({ status }: { status: Integration }) {
  if (status === "connected") return <span className="integration connected" title="Esta tela lê e grava no banco do painel.">Conectado</span>;
  if (status === "info") return <span className="integration info" title="Página de ajuda, sem dados.">Informativo</span>;
  return <span className="integration demo" title="Só interface: nada é salvo nesta tela.">Demonstrativo</span>;
}

export function PageHeader(props: {
  icon: LucideIcon;
  overline: string;
  title: string;
  description: string;
  integration: Integration;
  actions?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <header className="page-header">
      <div className="ph-main">
        <span className="ph-icon" aria-hidden="true"><Icon size={24} /></span>
        <div>
          <span className="eyebrow">{props.overline}</span>
          <h1>{props.title}</h1>
          <p>{props.description}</p>
        </div>
      </div>
      <div className="ph-actions">
        <IntegrationBadge status={props.integration} />
        {props.actions}
      </div>
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHead(props: { icon: LucideIcon; overline?: string; title: string; description?: string; action?: ReactNode; id?: string }) {
  const Icon = props.icon;
  return (
    <div className="card-head">
      <span className="ch-icon" aria-hidden="true"><Icon size={20} /></span>
      <div>
        {props.overline && <span className="eyebrow">{props.overline}</span>}
        <h2 id={props.id}>{props.title}</h2>
        {props.description && <p>{props.description}</p>}
      </div>
      {props.action && <div className="ch-action">{props.action}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, color }: { label: string; value: ReactNode; hint: string; color?: string }) {
  return (
    <div className="card kpi" style={color ? ({ "--kpi-color": color } as React.CSSProperties) : undefined}>
      <span className="eyebrow">{label}</span>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{hint}</div>
    </div>
  );
}

export type PillTone = "success" | "info" | "warning" | "danger" | "neutral";
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function EmptyState(props: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="empty">
      <div className="e-icon" aria-hidden="true"><Icon size={26} /></div>
      <h3>{props.title}</h3>
      <p>{props.text}</p>
      {props.action}
    </div>
  );
}

const ALERT_ICON = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: TriangleAlert };
export function Alert({ tone, children }: { tone: keyof typeof ALERT_ICON; children: ReactNode }) {
  const Icon = ALERT_ICON[tone];
  return (
    <div className={`alert alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function SkeletonCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Carregando">
      <div className="card-body" style={{ display: "grid", gap: 14 }}>
        <div className="skeleton" style={{ height: 20, width: "35%" }} />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 14, width: `${90 - i * 10}%` }} />
        ))}
      </div>
    </div>
  );
}
