import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Apple, CirclePlus, Smartphone, SlidersHorizontal, Tv } from "lucide-react";
import { Card, CardHead, EmptyState, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PROFILE_PLATFORM_LABEL, formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { listProfiles } from "@/server/services/profiles";
import { createProfileAction } from "../actions";

export const metadata: Metadata = { title: "Perfis de configuração" };

const PLATFORMS = [
  { value: "tv", icon: Tv, text: "Reprodução, guia, restrições e menus para controle remoto." },
  { value: "mobile", icon: Smartphone, text: "Reprodução, restrições e navegação por toque." },
  { value: "apple", icon: Apple, text: "Reprodução, restrições e comportamento em iOS e tvOS." },
] as const;

export default function ProfilesPage() {
  return (
    <>
      <PageHeader
        icon={SlidersHorizontal}
        overline="Gestão na nuvem"
        title="Perfis de configuração"
        description="Configurações reutilizáveis do player. Aplique um perfil a dispositivos ou a códigos de ativação."
        integration="connected"
      />
      <div className="grid">
        <Card>
          <CardHead icon={CirclePlus} overline="Criar perfil" title="Escolha a plataforma" description="O editor mostra só as opções suportadas pela plataforma escolhida." />
          <div className="card-body">
            <ActionForm action={createProfileAction}>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="sr-only">Plataforma</legend>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  {PLATFORMS.map((p, i) => {
                    const Icon = p.icon;
                    return (
                      <label key={p.value} className="setting" style={{ alignItems: "flex-start", cursor: "pointer" }}>
                        <span className="s-text">
                          <strong style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon size={18} aria-hidden="true" /> {PROFILE_PLATFORM_LABEL[p.value]}</strong>
                          <span>{p.text}</span>
                        </span>
                        <input type="radio" name="platform" value={p.value} defaultChecked={i === 0} required />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="form-row" style={{ marginTop: 16, alignItems: "end" }}>
                <div className="field">
                  <label htmlFor="profile-name">Nome do perfil</label>
                  <input id="profile-name" name="name" className="input" required maxLength={60} placeholder="Ex.: TV padrão clientes" />
                </div>
                <div><SubmitButton>Criar e editar</SubmitButton></div>
              </div>
            </ActionForm>
          </div>
        </Card>
        <Suspense fallback={<SkeletonCard rows={4} />}>
          <ProfileList />
        </Suspense>
      </div>
    </>
  );
}

async function ProfileList() {
  await requireAdmin();
  const profiles = await listProfiles(await getDb());
  return (
    <Card>
      <CardHead icon={SlidersHorizontal} overline="Inventário" title="Seus perfis" description={`${profiles.length} ${profiles.length === 1 ? "perfil" : "perfis"}`} />
      {profiles.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title="Nenhum perfil ainda" text="Crie o primeiro perfil acima para padronizar as configurações dos dispositivos." />
      ) : (
        <table className="table">
          <thead><tr><th scope="col">Nome</th><th scope="col">Plataforma</th><th scope="col">Dispositivos</th><th scope="col">Atualizado</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td><Link className="t-main" href={`/perfis/${p.id}`}>{p.name}</Link></td>
                <td data-label="Plataforma">{PROFILE_PLATFORM_LABEL[p.platform]}</td>
                <td data-label="Dispositivos">{p.deviceCount}</td>
                <td data-label="Atualizado">{formatDate(p.updatedAt)}</td>
                <td className="t-actions"><Link href={`/perfis/${p.id}`} className="btn btn-secondary btn-sm">Editar</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
