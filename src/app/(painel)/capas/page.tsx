import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowDown, ArrowUp, Clapperboard, Film, Images, Tv } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardHead, EmptyState, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { listArtwork, type ArtworkKind } from "@/server/services/artwork";
import { addArtworkAction, moveArtworkAction, removeArtworkAction } from "../actions";

export const metadata: Metadata = { title: "Capas e logos" };

// One block per list the TV shows (reference: Serviços Inclusos and Grades de Streaming in web-tv/series.html).
const BLOCKS: { kind: ArtworkKind; icon: LucideIcon; overline: string; title: string; description: string; namePlaceholder: string; nameHint: string }[] = [
  {
    kind: "service", icon: Tv, overline: "Serviços Inclusos", title: "Logos dos serviços",
    description: "A fileira de logos (Netflix, Prime Video, HBO Max…) no topo de Filmes e Séries.",
    namePlaceholder: "Ex.: Netflix", nameHint: "Nome do serviço, como deve aparecer para o leitor de tela e no aviso ao abrir.",
  },
  {
    kind: "series", icon: Clapperboard, overline: "Grades de Séries", title: "Capas das pastas de séries",
    description: "Uma capa para cada pasta de séries da sua lista (Doramas, Kids, Animes…).",
    namePlaceholder: "Ex.: Doramas", nameHint: "Escreva o nome da pasta como está na lista; maiúsculas e acentos não importam.",
  },
  {
    kind: "movies", icon: Film, overline: "Grades de Filmes", title: "Capas das pastas de filmes",
    description: "Uma capa para cada pasta de filmes da sua lista (Lançamentos, Ação, Terror…).",
    namePlaceholder: "Ex.: Lançamentos", nameHint: "Escreva o nome da pasta como está na lista; maiúsculas e acentos não importam.",
  },
];

export default function ArtworkPage() {
  return (
    <>
      <PageHeader icon={Images} overline="App da TV" title="Capas e logos" integration="connected"
        description="Cole o link de cada imagem. As TVs recebem na hora; a ordem aqui é a ordem na tela." />
      <Suspense fallback={<SkeletonCard rows={8} />}>
        <Artwork />
      </Suspense>
    </>
  );
}

async function Artwork() {
  await requireAdmin();
  const all = await listArtwork(await getDb());
  return (
    <>
      {BLOCKS.map((b) => {
        const items = all.filter((a) => a.kind === b.kind);
        return (
          <Card key={b.kind}>
            <CardHead icon={b.icon} overline={b.overline} title={b.title} description={b.description} />
            <div className="card-body">
              <ActionForm action={addArtworkAction} resetOnSuccess>
                <input type="hidden" name="kind" value={b.kind} />
                <div className="form-row">
                  <div className="field">
                    <label htmlFor={`name-${b.kind}`}>Nome</label>
                    <input id={`name-${b.kind}`} name="name" className="input" required maxLength={80} placeholder={b.namePlaceholder} />
                    <p className="hint">{b.nameHint}</p>
                  </div>
                  <div className="field">
                    <label htmlFor={`url-${b.kind}`}>Link da imagem</label>
                    <input id={`url-${b.kind}`} name="imageUrl" type="url" className="input" required placeholder="https://…/logo.png" />
                    <p className="hint">Link direto da imagem (PNG, JPG, SVG ou WebP). O mesmo nome de novo troca o link.</p>
                  </div>
                </div>
                <div className="form-actions"><SubmitButton>Adicionar</SubmitButton></div>
              </ActionForm>
            </div>
            {items.length === 0 ? (
              <div className="card-body"><EmptyState icon={b.icon} title="Nenhuma imagem ainda" text="As imagens adicionadas aparecem aqui, com a prévia." /></div>
            ) : (
              <table className="table">
                <thead><tr><th>Prévia</th><th>Nome</th><th>Link</th><th>Ordem</th><th /></tr></thead>
                <tbody>
                  {items.map((a, i) => (
                    <tr key={a.id}>
                      <td>
                        {/* eslint-disable-next-line @next/next/no-img-element -- external links chosen by the admin */}
                        <img src={a.imageUrl} alt="" style={{ width: b.kind === "service" ? 72 : 54, height: 72, objectFit: b.kind === "service" ? "contain" : "cover", borderRadius: 8, background: "#10141d" }} />
                      </td>
                      <td><strong>{a.name}</strong></td>
                      <td style={{ maxWidth: 360, wordBreak: "break-all" }} className="hint">{a.imageUrl}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <form action={moveArtworkAction}>
                            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="dir" value="up" />
                            <button className="btn btn-secondary btn-sm" disabled={i === 0} aria-label={`Subir ${a.name}`}><ArrowUp size={16} aria-hidden="true" /></button>
                          </form>
                          <form action={moveArtworkAction}>
                            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="dir" value="down" />
                            <button className="btn btn-secondary btn-sm" disabled={i === items.length - 1} aria-label={`Descer ${a.name}`}><ArrowDown size={16} aria-hidden="true" /></button>
                          </form>
                        </div>
                      </td>
                      <td>
                        <form action={removeArtworkAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <ConfirmSubmit message={`Remover "${a.name}"?`}>Remover</ConfirmSubmit>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        );
      })}
    </>
  );
}
