import type { Metadata } from "next";
import { Tv } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { activateAction } from "./actions";
import { Prefill } from "./prefill";

export const metadata: Metadata = { title: "Ativar aparelho", robots: { index: false, follow: false } };

/** Public page of the first access: the customer types the MAC and the 6-digit code shown on the TV. */
export default function ActivatePage() {
  return (
    <main className="auth">
      <div className="card auth-card">
        <div className="card-body">
          <span className="brand-mark" aria-hidden="true"><Tv size={20} /></span>
          <h1>Ativar aparelho</h1>
          <p className="muted" style={{ marginTop: 0 }}>Digite o endereço MAC e o código de ativação que aparecem na tela da TV.</p>
          <ActivateForm />
          <Prefill />
          <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
            Aviso: o SFL Grupo é exclusivamente um player (aplicativo de reprodução de mídia). Não fornecemos, hospedamos ou vendemos listas de canais,
            IPTV ou arquivos M3U. O conteúdo reproduzido no aplicativo é de total responsabilidade do usuário.
          </p>
        </div>
      </div>
    </main>
  );
}

function ActivateForm() {
  return (
    <ActionForm action={activateAction}>
      <div className="field">
        <label htmlFor="mac">Endereço MAC</label>
        <input id="mac" name="mac" className="input" placeholder="00:1A:2B:3C:4D:5E" autoComplete="off" autoCapitalize="characters" required />
      </div>
      <div className="field">
        <label htmlFor="code">Código de ativação</label>
        <input id="code" name="code" className="input" placeholder="884932" inputMode="numeric" pattern="[0-9 ]{6,7}" autoComplete="one-time-code" required />
      </div>
      <div className="form-actions">
        <SubmitButton className="w-full">Ativar</SubmitButton>
      </div>
    </ActionForm>
  );
}