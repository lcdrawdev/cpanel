import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { PlannedPage } from "@/components/planned-page";

export const metadata: Metadata = { title: "Assinatura" };

export default function Page() {
  return <PlannedPage icon={CreditCard} overline="Conta" title="Assinatura" stage="Etapa 3" description="Plano da conta e capacidade de dispositivos gerenciados."
    planned={["Mostrar plano, limite de dispositivos e uso atual.", "Avisar quando o limite estiver perto de ser atingido.", "Link para o portal de pagamentos (a definir)."]} />;
}
