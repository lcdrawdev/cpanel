import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { MonitorSmartphone } from "lucide-react";
import { PRODUCT_NAME } from "@/config";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getDb } from "@/server/db/client";
import { adminCount } from "@/server/services/admins";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="auth">
      <div className="card auth-card">
        <div className="card-body">
          <span className="brand-mark" aria-hidden="true"><MonitorSmartphone size={20} /></span>
          <h1>Entrar no {PRODUCT_NAME}</h1>
          <p className="muted" style={{ marginTop: 0 }}>Gerencie dispositivos, playlists e códigos de ativação.</p>
          <Suspense>
            <RedirectToSetupIfEmpty />
          </Suspense>
          <ActionForm action={loginAction}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" className="input" autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="password">Senha</label>
              <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
            </div>
            <div className="form-actions">
              <SubmitButton className="w-full">Entrar</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}

/** Fresh install: no admin yet, so the first visit goes to the one-time setup. */
async function RedirectToSetupIfEmpty() {
  await connection();
  if ((await adminCount(await getDb())) === 0) redirect("/setup");
  return null;
}
