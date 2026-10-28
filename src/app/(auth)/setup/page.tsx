import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { MonitorSmartphone } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getDb } from "@/server/db/client";
import { adminCount } from "@/server/services/admins";
import { setupAction } from "../actions";

export const metadata: Metadata = { title: "Configuração inicial" };

export default function SetupPage() {
  return (
    <main className="auth">
      <div className="card auth-card">
        <div className="card-body">
          <span className="brand-mark" aria-hidden="true"><MonitorSmartphone size={20} /></span>
          <h1>Configuração inicial</h1>
          <p className="muted" style={{ marginTop: 0 }}>Crie a conta do administrador principal. Esta tela só aparece enquanto não existe nenhum administrador.</p>
          <Suspense>
            <SetupForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function SetupForm() {
  await connection();
  if ((await adminCount(await getDb())) > 0) redirect("/login");
  return (
    <ActionForm action={setupAction}>
      <div className="field">
        <label htmlFor="name">Nome</label>
        <input id="name" name="name" className="input" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" className="input" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={10} required aria-describedby="pw-hint" />
        <p className="hint" id="pw-hint">Mínimo de 10 caracteres.</p>
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirmar senha</label>
        <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={10} required />
      </div>
      <div className="form-actions">
        <SubmitButton>Criar conta e entrar</SubmitButton>
      </div>
    </ActionForm>
  );
}
