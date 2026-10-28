import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { Card, CardHead, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PROFILE_PLATFORM_LABEL } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getProfile } from "@/server/services/profiles";
import { ServiceError } from "@/server/services/errors";
import { SETTING_GROUPS, resolveSettings } from "@/shared/settings";
import { deleteProfileAction, saveProfileSettingsAction } from "../../actions";

export const metadata: Metadata = { title: "Editar perfil" };

export default function ProfileEditorPage(props: PageProps<"/perfis/[id]">) {
  return (
    <Suspense fallback={<SkeletonCard rows={10} />}>
      <ProfileEditor {...props} />
    </Suspense>
  );
}

async function ProfileEditor({ params }: PageProps<"/perfis/[id]">) {
  await requireAdmin();
  const { id } = await params;
  let profile;
  try {
    profile = await getProfile(await getDb(), id);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  }
  const values = resolveSettings(profile.settings);
  return (
    <>
      <PageHeader
        icon={SlidersHorizontal}
        overline={`Perfil · ${PROFILE_PLATFORM_LABEL[profile.platform]}`}
        title={profile.name}
        description="Ao salvar, todos os dispositivos com este perfil recebem a mudança na próxima consulta."
        integration="connected"
        actions={<Link href="/perfis" className="btn btn-on-dark"><ArrowLeft size={18} aria-hidden="true" /> Perfis</Link>}
      />
      <ActionForm action={saveProfileSettingsAction} className="grid">
        <input type="hidden" name="id" value={profile.id} />
        {SETTING_GROUPS.map((g) => (
          <Card key={g.id}>
            <CardHead icon={SlidersHorizontal} overline="Configurações" title={g.title} />
            <div className="card-body">
              {g.fields.map((f) => {
                const id = `s-${f.key}`;
                const v = values[f.key as keyof typeof values];
                return (
                  <div key={f.key} className="setting">
                    <label className="s-text" htmlFor={id} style={{ cursor: "pointer" }}>
                      <strong>{f.label}</strong>
                      <span>{f.help}</span>
                    </label>
                    {f.type === "boolean" && <input id={id} name={f.key} type="checkbox" className="switch" defaultChecked={Boolean(v)} />}
                    {f.type === "number" && <input id={id} name={f.key} type="number" className="input" min={f.min} max={f.max} defaultValue={Number(v)} style={{ minWidth: 100, width: 120 }} />}
                    {f.type === "select" && (
                      <select id={id} name={f.key} className="input" defaultValue={String(v)}>
                        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
        <div className="form-actions" style={{ justifyContent: "space-between" }}>
          <span className="muted">As alterações só valem depois de salvar.</span>
          <SubmitButton>Salvar perfil</SubmitButton>
        </div>
      </ActionForm>
      <Card className="mt-6">
        <div className="card-body" style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div><strong>Excluir perfil</strong><div className="muted">Os dispositivos que usam este perfil voltam aos padrões do app.</div></div>
          <form action={deleteProfileAction}>
            <input type="hidden" name="id" value={profile.id} />
            <ConfirmSubmit message={`Excluir o perfil “${profile.name}”?`}>Excluir perfil</ConfirmSubmit>
          </form>
        </div>
      </Card>
    </>
  );
}
