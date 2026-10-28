import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CirclePlus, Layers } from "lucide-react";
import { Card, CardHead, EmptyState, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { listGroups } from "@/server/services/groups";
import { listPlaylists } from "@/server/services/playlists";
import { listProfiles } from "@/server/services/profiles";
import { createGroupAction } from "../actions";
import { GroupFields } from "./group-fields";

export const metadata: Metadata = { title: "Grupos de dispositivos" };

export default function GroupsPage() {
  return (
    <>
      <PageHeader
        icon={Layers}
        overline="Gestão na nuvem"
        title="Grupos de dispositivos"
        description="Organize dispositivos em grupos e aplique perfil e playlists a todos de uma vez."
        integration="connected"
      />
      <Suspense fallback={<SkeletonCard rows={6} />}>
        <Groups />
      </Suspense>
    </>
  );
}

async function Groups() {
  await requireAdmin();
  const db = await getDb();
  const [groups, profiles, playlists] = await Promise.all([listGroups(db), listProfiles(db), listPlaylists(db)]);
  return (
    <div className="grid">
      <Card>
        <CardHead icon={Layers} overline="Inventário" title="Seus grupos" description={`${groups.length} ${groups.length === 1 ? "grupo" : "grupos"}`} />
        {groups.length === 0 ? (
          <EmptyState icon={Layers} title="Crie seu primeiro grupo" text="Dê um nome, escolha o perfil e as playlists. Depois adicione dispositivos ao grupo." />
        ) : (
          <table className="table">
            <thead><tr><th scope="col">Nome</th><th scope="col">Perfil</th><th scope="col">Playlists</th><th scope="col">Dispositivos</th><th scope="col">Atualizado</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td><Link className="t-main" href={`/grupos/${g.id}`}>{g.name}</Link></td>
                  <td data-label="Perfil">{g.profileName ?? <span className="muted">Nenhum</span>}</td>
                  <td data-label="Playlists">{g.playlistIds.length}</td>
                  <td data-label="Dispositivos">{g.deviceCount}</td>
                  <td data-label="Atualizado">{formatDate(g.updatedAt)}</td>
                  <td className="t-actions"><Link href={`/grupos/${g.id}`} className="btn btn-secondary btn-sm">Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <CardHead icon={CirclePlus} overline="Novo grupo" title="Criar grupo" description="Os dispositivos que entrarem no grupo recebem este perfil e estas playlists." />
        <div className="card-body">
          <ActionForm action={createGroupAction}>
            <GroupFields
              prefix="new-group"
              profiles={profiles.map(({ id, name, platform }) => ({ id, name, platform }))}
              playlists={playlists.map(({ id, name, type }) => ({ id, name, type }))}
            />
            <div className="form-actions"><SubmitButton>Criar grupo</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
