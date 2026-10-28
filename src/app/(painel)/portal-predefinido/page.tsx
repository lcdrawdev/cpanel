import type { Metadata } from "next";
import { Suspense } from "react";
import { Image as ImageIcon, Plug, Server } from "lucide-react";
import { Card, CardHead, EmptyState, Kpi, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getAccountSettings } from "@/server/services/account-settings";
import { listPredefinedPortals } from "@/server/services/predefined-portal";
import { addPredefinedPortalAction, removePredefinedPortalAction, saveBrandingAction, setPortalModeAction } from "../actions";

export const metadata: Metadata = { title: "Portal pré-definido" };

const MODE_LABEL = { off: "Desligado", xtream: "XC API", stalker: "Stalker / MAG" } as const;

export default function PredefinedPortalPage() {
  return (
    <>
      <PageHeader
        icon={Server}
        overline="Portal pré-definido"
        title="Configuração do portal"
        description="Experiência com marca própria: o usuário só digita usuário e senha (XC) ou usa o MAC (Stalker); o endereço vem daqui."
        integration="connected"
      />
      <Suspense fallback={<SkeletonCard rows={8} />}>
        <PortalConfig />
      </Suspense>
    </>
  );
}

async function PortalConfig() {
  await requireAdmin();
  const db = await getDb();
  const [s, portals] = await Promise.all([getAccountSettings(db), listPredefinedPortals(db)]);
  const count = (t: "xtream" | "stalker") => portals.filter((p) => p.type === t).length;
  return (
    <>
      <div className="grid grid-kpi">
        <Kpi label="Modo ativo" value={MODE_LABEL[s.portalMode]} hint="um tipo por vez" color={s.portalMode === "off" ? "var(--color-border-strong)" : "var(--color-green-500)"} />
        <Kpi label="Portais XC" value={count("xtream")} hint="cadastrados" />
        <Kpi label="Portais Stalker" value={count("stalker")} hint="cadastrados" />
        <Kpi label="Identidade" value={s.brandLogoUrl || s.brandHomeLine ? "Personalizada" : "Padrão"} hint="logo e texto inicial" />
      </div>
      <div className="grid grid-2">
        <div className="grid">
          <Card>
            <CardHead icon={Plug} overline="Experiência de conexão" title="Tipo de portal" description="Muda o que o usuário precisa informar ao adicionar a lista no app." />
            <div className="card-body">
              <ActionForm action={setPortalModeAction}>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="sr-only">Tipo de portal</legend>
                  {([
                    ["off", "Desligado", "O app funciona normalmente; o usuário cadastra as próprias listas."],
                    ["xtream", "XC API", "O usuário digita só usuário e senha; o endereço do portal é preenchido."],
                    ["stalker", "Stalker / MAG", "O app usa o MAC do aparelho; o endereço do portal é preenchido."],
                  ] as const).map(([value, title, text]) => (
                    <label key={value} className="setting" style={{ cursor: "pointer" }}>
                      <span className="s-text"><strong>{title}</strong><span>{text}</span></span>
                      <input type="radio" name="mode" value={value} defaultChecked={s.portalMode === value} />
                    </label>
                  ))}
                </fieldset>
                <div className="form-actions"><SubmitButton>Aplicar tipo</SubmitButton></div>
              </ActionForm>
            </div>
          </Card>
          <Card>
            <CardHead icon={Server} overline="Inventário" title="Portais cadastrados" description="Só os do tipo ativo são enviados aos apps." />
            {portals.length === 0 ? (
              <EmptyState icon={Server} title="Nenhum portal cadastrado" text="Adicione o endereço do portal XC ou Stalker abaixo." />
            ) : (
              <table className="table">
                <thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">URL</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {portals.map((p) => (
                    <tr key={p.id}>
                      <td><span className="t-main">{p.name}</span></td>
                      <td data-label="Tipo">{p.type === "xtream" ? "XC API" : "Stalker / MAG"}</td>
                      <td data-label="URL" className="mono" style={{ overflowWrap: "anywhere" }}>{p.url}</td>
                      <td className="t-actions">
                        <form action={removePredefinedPortalAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <ConfirmSubmit message={`Remover o portal “${p.name}”?`}>Remover</ConfirmSubmit>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="card-body" style={{ borderTop: "1px solid var(--color-border)" }}>
              <ActionForm action={addPredefinedPortalAction} resetOnSuccess>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="pp-name">Nome</label>
                    <input id="pp-name" name="name" className="input" required maxLength={60} />
                  </div>
                  <div className="field">
                    <label htmlFor="pp-type">Tipo</label>
                    <select id="pp-type" name="type" className="input" defaultValue="xtream">
                      <option value="xtream">XC API</option>
                      <option value="stalker">Stalker / MAG</option>
                    </select>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 16 }}>
                  <label htmlFor="pp-url">URL do portal</label>
                  <input id="pp-url" name="url" type="url" className="input" required placeholder="http://portal.exemplo.com:8080" />
                  <p className="hint">Sem usuário ou senha na URL.</p>
                </div>
                <div className="form-actions"><SubmitButton>Adicionar portal</SubmitButton></div>
              </ActionForm>
            </div>
          </Card>
        </div>
        <Card>
          <CardHead icon={ImageIcon} overline="Identidade do app" title="Marca e textos" description="Exibidos no app quando o portal pré-definido está ativo." />
          <div className="card-body">
            <ActionForm action={saveBrandingAction}>
              <div className="field">
                <label htmlFor="logoUrl">URL do logo</label>
                <input id="logoUrl" name="logoUrl" type="url" className="input" defaultValue={s.brandLogoUrl} placeholder="https://.../logo.png" />
                <p className="hint">Link direto para a imagem (PNG ou SVG).</p>
              </div>
              <div className="field">
                <label htmlFor="homeLine">Texto da tela inicial</label>
                <input id="homeLine" name="homeLine" className="input" maxLength={80} defaultValue={s.brandHomeLine} />
              </div>
              <div className="field">
                <label htmlFor="userAgent">User-Agent padrão</label>
                <input id="userAgent" name="userAgent" className="input mono" maxLength={200} defaultValue={s.userAgent} />
                <p className="hint">Enviado pelo player ao portal. Em branco usa o padrão do app.</p>
              </div>
              <div className="field">
                <label htmlFor="activationCodeHint">Texto do código de ativação</label>
                <textarea id="activationCodeHint" name="activationCodeHint" className="input" rows={3} maxLength={300} defaultValue={s.activationCodeHint} />
                <p className="hint">Explicação mostrada quando o usuário for digitar o código de ativação.</p>
              </div>
              {s.brandLogoUrl && (
                <div className="field">
                  <span className="label">Prévia do logo</span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- external, admin-provided URL; not optimized on purpose */}
                  <img src={s.brandLogoUrl} alt="Prévia do logo configurado" style={{ maxHeight: 64, maxWidth: "100%", objectFit: "contain", background: "var(--color-navy-900)", padding: 8, borderRadius: 8 }} />
                </div>
              )}
              <div className="form-actions"><SubmitButton>Salvar identidade</SubmitButton></div>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
