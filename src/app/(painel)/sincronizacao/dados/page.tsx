import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Database, ListVideo, Star } from "lucide-react";
import { Alert, Card, CardHead, EmptyState, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getSyncState } from "@/server/services/sync";
import { listPlaylists } from "@/server/services/playlists";
import { addFavoriteAction, removeFavoriteAction, saveSyncPlaylistsAction } from "../../actions";

export const metadata: Metadata = { title: "Dados sincronizados" };

export default function SyncDataPage() {
  return (
    <>
      <PageHeader icon={Database} overline="Sincronização" title="Dados sincronizados" integration="connected"
        description="Playlists e favoritos compartilhados entre os dispositivos participantes." />
      <Suspense fallback={<SkeletonCard rows={8} />}>
        <SyncData />
      </Suspense>
    </>
  );
}

async function SyncData() {
  await requireAdmin();
  const db = await getDb();
  const [state, playlists] = await Promise.all([getSyncState(db), listPlaylists(db)]);
  const pool = new Set(state.poolPlaylistIds);
  return (
    <>
      {!state.account.syncEnabled && (
        <Alert tone="info">A sincronização da conta está desligada. <Link href="/sincronizacao/configuracao">Ativar em Configuração</Link></Alert>
      )}
      <div className="grid grid-2">
        <Card>
          <CardHead icon={ListVideo} overline="Conteúdo" title="Playlists compartilhadas" description="Somadas às playlists próprias de cada participante." />
          <div className="card-body">
            {playlists.length === 0 ? (
              <EmptyState icon={ListVideo} title="Nenhuma playlist cadastrada" text="Cadastre playlists em Portais e playlists." action={<Link href="/portais" className="btn btn-primary">Cadastrar playlist</Link>} />
            ) : (
              <ActionForm action={saveSyncPlaylistsAction}>
                {playlists.map((p) => (
                  <label key={p.id} className="setting" style={{ cursor: "pointer" }}>
                    <span className="s-text"><strong>{p.name}</strong><span>{p.type === "xtream" ? "XC API" : "M3U"}</span></span>
                    <input type="checkbox" className="switch" name="playlistIds" value={p.id} defaultChecked={pool.has(p.id)} />
                  </label>
                ))}
                <div className="form-actions"><SubmitButton>Aplicar</SubmitButton></div>
              </ActionForm>
            )}
          </div>
        </Card>
        <Card>
          <CardHead icon={Star} overline="TV ao vivo" title="Favoritos" description="Os apps participantes também podem adicionar e remover." />
          {state.favorites.length === 0 ? (
            <EmptyState icon={Star} title="Nenhum favorito" text="Adicione um canal abaixo." />
          ) : (
            <table className="table">
              <thead><tr><th scope="col">Canal</th><th scope="col">Playlist</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {state.favorites.map((f) => (
                  <tr key={f.id}>
                    <td><span className="t-main">{f.channelName}</span></td>
                    <td data-label="Playlist">{f.playlistName ?? <span className="muted">Qualquer</span>}</td>
                    <td className="t-actions">
                      <form action={removeFavoriteAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <ConfirmSubmit message={`Remover “${f.channelName}” dos favoritos?`}>Remover</ConfirmSubmit>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="card-body" style={{ borderTop: "1px solid var(--color-border)" }}>
            <ActionForm action={addFavoriteAction} resetOnSuccess>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="fav-name">Canal</label>
                  <input id="fav-name" name="channelName" className="input" required maxLength={120} placeholder="Nome exato do canal" />
                </div>
                <div className="field">
                  <label htmlFor="fav-playlist">Playlist</label>
                  <select id="fav-playlist" name="playlistId" className="input" defaultValue="">
                    <option value="">Qualquer playlist</option>
                    {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-actions"><SubmitButton>Adicionar favorito</SubmitButton></div>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
