import type { Metadata } from "next";
import { Suspense } from "react";
import { KeyRound } from "lucide-react";
import { Card, CardHead, EmptyState, PageHeader, Pill, SkeletonCard } from "@/components/ui";
import { ConfirmSubmit } from "@/components/forms";
import { CreateCodeButton } from "@/components/create-code";
import { formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { listCodes } from "@/server/services/codes";
import { listPlaylists } from "@/server/services/playlists";
import { listProfiles } from "@/server/services/profiles";
import { listGroups } from "@/server/services/groups";
import { deleteCodeAction, toggleCodeAction } from "../actions";

export const metadata: Metadata = { title: "Códigos de ativação" };

export default function CodesPage() {
  return (
    <Suspense fallback={<SkeletonCard rows={6} />}>
      <Codes />
    </Suspense>
  );
}

async function Codes() {
  await requireAdmin();
  const db = await getDb();
  const [codes, profiles, playlists, groups] = await Promise.all([listCodes(db), listProfiles(db), listPlaylists(db), listGroups(db)]);
  const create = <CreateCodeButton profiles={profiles.map(({ id, name }) => ({ id, name }))} playlists={playlists.map(({ id, name }) => ({ id, name }))} groups={groups.map(({ id, name }) => ({ id, name }))} />;
  return (
    <>
      <PageHeader
        icon={KeyRound}
        overline="Gestão na nuvem"
        title="Códigos de ativação"
        description="Códigos reutilizáveis para cadastrar dispositivos já com perfil, playlists e limite de usos."
        integration="connected"
        actions={create}
      />
      <Card>
        <CardHead icon={KeyRound} overline="Inventário" title="Seus códigos" description={`${codes.length} ${codes.length === 1 ? "código" : "códigos"}`} />
        {codes.length === 0 ? (
          <EmptyState icon={KeyRound} title="Nenhum código criado" text="Crie um código e digite-o no app do dispositivo para ativá-lo sem cadastrar o Device ID antes." action={create} />
        ) : (
          <table className="table">
            <thead>
              <tr><th scope="col">Apelido</th><th scope="col">Código</th><th scope="col">Usos</th><th scope="col">Perfil</th><th scope="col">Grupo</th><th scope="col">Playlists</th><th scope="col">Validade</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const expired = c.expired;
                const full = c.uses >= c.maxUses;
                return (
                  <tr key={c.id}>
                    <td><span className="t-main">{c.label}</span></td>
                    <td data-label="Código"><span className="code-chip">{c.code}</span></td>
                    <td data-label="Usos"><span style={{ color: full ? "var(--color-danger)" : undefined, fontWeight: 600 }}>{c.uses}/{c.maxUses}</span></td>
                    <td data-label="Perfil">{c.profileName ?? <span className="muted">Nenhum</span>}</td>
                    <td data-label="Grupo">{c.groupName ?? <span className="muted">Nenhum</span>}</td>
                    <td data-label="Playlists">{c.playlistIds.length}</td>
                    <td data-label="Validade">{c.expiresAt ? formatDate(c.expiresAt) : <span className="muted">Sem prazo</span>}</td>
                    <td data-label="Situação">
                      {!c.enabled ? <Pill tone="neutral">Desativado</Pill> : expired ? <Pill tone="danger">Expirado</Pill> : full ? <Pill tone="warning">Esgotado</Pill> : <Pill tone="success">Disponível</Pill>}
                    </td>
                    <td className="t-actions">
                      <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                        <form action={toggleCodeAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="enabled" value={String(!c.enabled)} />
                          <button className="btn btn-secondary btn-sm">{c.enabled ? "Desativar" : "Ativar"}</button>
                        </form>
                        <form action={deleteCodeAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmSubmit message={`Excluir o código ${c.code}? Dispositivos já ativados continuam funcionando.`}>Excluir</ConfirmSubmit>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
