import type { Metadata } from "next";
import { Suspense } from "react";
import { ListVideo } from "lucide-react";
import { Card, CardHead, EmptyState, PageHeader, Pill, SkeletonCard } from "@/components/ui";
import { ConfirmSubmit } from "@/components/forms";
import { CreatePlaylistButton, EditPlaylistButton } from "@/components/playlist-form";
import { formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { listPlaylists } from "@/server/services/playlists";
import { deletePlaylistAction } from "../actions";

export const metadata: Metadata = { title: "Portais e playlists" };

export default function PlaylistsPage() {
  return (
    <>
      <PageHeader
        icon={ListVideo}
        overline="Gestão na nuvem"
        title="Portais e playlists"
        description="Cadastro central de portais XC e listas M3U. Altere aqui e todos os dispositivos vinculados recebem a mudança."
        integration="connected"
        actions={<CreatePlaylistButton />}
      />
      <Suspense fallback={<SkeletonCard rows={5} />}>
        <PlaylistTable />
      </Suspense>
    </>
  );
}

async function PlaylistTable() {
  await requireAdmin();
  const rows = await listPlaylists(await getDb());
  return (
    <Card>
      <CardHead icon={ListVideo} overline="Inventário" title="Playlists cadastradas" description={`${rows.length} ${rows.length === 1 ? "playlist" : "playlists"}`} />
      {rows.length === 0 ? (
        <EmptyState icon={ListVideo} title="Nenhuma playlist ainda" text="Cadastre um portal XC (usuário e senha) ou uma lista M3U." action={<CreatePlaylistButton />} />
      ) : (
        <table className="table">
          <thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">URL</th><th scope="col">Credenciais</th><th scope="col">Dispositivos</th><th scope="col">Atualizada</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><span className="t-main">{p.name}</span></td>
                <td data-label="Tipo">{p.type === "xtream" ? "XC API" : "M3U"}</td>
                <td data-label="URL" className="mono" style={{ overflowWrap: "anywhere" }}>{p.url}</td>
                <td data-label="Credenciais">{p.hasCredentials ? <Pill tone="success">Criptografadas</Pill> : <span className="muted">—</span>}</td>
                <td data-label="Dispositivos">{p.deviceCount}</td>
                <td data-label="Atualizada">{formatDate(p.updatedAt)}</td>
                <td className="t-actions">
                  <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                    <EditPlaylistButton playlist={{ id: p.id, name: p.name, type: p.type, url: p.url, hasCredentials: p.hasCredentials }} />
                    <form action={deletePlaylistAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmSubmit message={`Excluir “${p.name}”? Ela some de ${p.deviceCount} dispositivo(s).`}>Excluir</ConfirmSubmit>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
