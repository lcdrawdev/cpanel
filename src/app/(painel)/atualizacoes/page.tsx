import type { Metadata } from "next";
import { Suspense } from "react";
import { RefreshCw, Upload, Send, PauseCircle, Trash2, Smartphone } from "lucide-react";
import { Alert, Card, CardHead, PageHeader, Pill, SkeletonCard } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PLATFORM_LABEL } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { listUpdates, SELF_UPDATING, type Platform } from "@/server/services/app-updates";
import { importUpdateAction, publishUpdateAction, deleteUpdateAction } from "../actions";

export const metadata: Metadata = { title: "Atualizações" };

// Order shown in the panel. Android first (download-and-install straight from the TV); the rest keep the
// version/arquivo here but são atualizados pelas lojas de cada plataforma.
const PLATFORMS: Platform[] = ["android_tv", "android_mobile", "tizen", "webos", "roku", "apple"];

export default function Page() {
  return (
    <>
      <PageHeader icon={RefreshCw} overline="App da TV" title="Atualizações" integration="connected"
        description="Importe uma nova versão do app e envie para os aparelhos. No Android, a TV baixa e instala; nas outras plataformas, a atualização vai pelas lojas." />
      <Suspense fallback={<SkeletonCard rows={6} />}>
        <UpdatesList />
      </Suspense>
    </>
  );
}

async function UpdatesList() {
  await requireAdmin();
  const rows = await listUpdates(await getDb());
  const byPlatform = new Map(rows.map((r) => [r.platform, r]));
  return (
    <div className="grid">
      {PLATFORMS.map((p) => {
        const u = byPlatform.get(p);
        const selfUpdating = SELF_UPDATING.includes(p);
        return (
          <Card key={p}>
            <CardHead icon={Smartphone} overline="Plataforma" title={PLATFORM_LABEL[p]}
              description={selfUpdating ? "A TV baixa e instala a nova versão com um toque." : "Guardado aqui; a atualização final passa pela loja da plataforma."} />
            <div className="card-body" style={{ display: "grid", gap: "var(--space-4)" }}>
              {u ? (
                <div className="facts" style={{ margin: 0 }}>
                  <div className="setting">
                    <div className="s-text">
                      <strong>Versão importada: {u.version} {u.versionCode ? <span className="muted">(código {u.versionCode})</span> : null}</strong>
                      <span>{u.fileName} · {(u.fileSize / 1_048_576).toFixed(1)} MB · {u.mandatory ? "obrigatória" : "opcional"}{u.notes ? ` · ${u.notes}` : ""}</span>
                    </div>
                    {u.published ? <Pill tone="success">Enviada</Pill> : <Pill tone="info">Rascunho</Pill>}
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                    <ActionForm action={publishUpdateAction}>
                      <input type="hidden" name="platform" value={p} />
                      <input type="hidden" name="published" value={u.published ? "false" : "true"} />
                      <SubmitButton variant={u.published ? "secondary" : "primary"}>
                        {u.published ? <><PauseCircle size={16} aria-hidden="true" /> Pausar envio</> : <><Send size={16} aria-hidden="true" /> Enviar atualização</>}
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={deleteUpdateAction}>
                      <input type="hidden" name="platform" value={p} />
                      <ConfirmSubmit message={`Remover a atualização importada de ${PLATFORM_LABEL[p]}?`} variant="danger">
                        <Trash2 size={16} aria-hidden="true" /> Remover
                      </ConfirmSubmit>
                    </ActionForm>
                  </div>
                </div>
              ) : (
                <Alert tone="info">Nenhuma versão importada para {PLATFORM_LABEL[p]}.</Alert>
              )}

              <ActionForm action={importUpdateAction} resetOnSuccess>
                <input type="hidden" name="platform" value={p} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                  <div className="field">
                    <label htmlFor={`version-${p}`}>Versão</label>
                    <input id={`version-${p}`} name="version" className="input" placeholder="0.18.9" required />
                  </div>
                  <div className="field">
                    <label htmlFor={`code-${p}`}>Código {selfUpdating ? "(versionCode)" : "(opcional)"}</label>
                    <input id={`code-${p}`} name="versionCode" type="number" min={0} className="input" placeholder="52" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`notes-${p}`}>Novidades (aparece na TV)</label>
                  <input id={`notes-${p}`} name="notes" className="input" placeholder="O que mudou nesta versão" />
                </div>
                <div className="field">
                  <label htmlFor={`file-${p}`}>Arquivo {selfUpdating ? "(.apk)" : "do pacote"}</label>
                  <input id={`file-${p}`} name="file" type="file" className="input" accept={selfUpdating ? ".apk,application/vnd.android.package-archive" : undefined} required />
                  <p className="hint">Até 60 MB. Fica como rascunho até você clicar em “Enviar atualização”.</p>
                </div>
                <label className="check-list" style={{ flexDirection: "row", alignItems: "center" }}><input type="checkbox" name="mandatory" /> Atualização obrigatória (a TV insiste até atualizar)</label>
                <div className="form-actions"><SubmitButton pendingLabel="Enviando arquivo…"><Upload size={16} aria-hidden="true" /> Importar atualização</SubmitButton></div>
              </ActionForm>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
