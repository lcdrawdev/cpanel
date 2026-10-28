import type { LucideIcon } from "lucide-react";
import { ListChecks } from "lucide-react";
import { Alert, Card, CardHead, PageHeader } from "./ui";

/**
 * Placeholder for sections of the reference panel that are not built yet.
 * It never shows fake data: it states what is planned and that nothing works here.
 */
export function PlannedPage(props: { icon: LucideIcon; overline: string; title: string; description: string; planned: string[]; stage: string }) {
  return (
    <>
      <PageHeader icon={props.icon} overline={props.overline} title={props.title} description={props.description} integration="demo" />
      <Card>
        <CardHead icon={ListChecks} overline={props.stage} title="O que esta tela vai fazer" />
        <div className="card-body">
          <Alert tone="warning">Tela demonstrativa: ainda não há funcionalidade nem dados conectados aqui.</Alert>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            {props.planned.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      </Card>
    </>
  );
}
