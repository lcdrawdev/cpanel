import type { Metadata } from "next";
import { Suspense } from "react";
import { EyeOff, Filter, KeyRound, Trophy } from "lucide-react";
import { Card, CardHead, EmptyState, Kpi, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getAccountSettings } from "@/server/services/account-settings";
import { ENTRY_KIND_LABEL, SPORTS } from "@/shared/sports";
import { hideSportEntryAction, saveSportsDataKeysAction, saveSportsModeAction, unhideSportEntryAction } from "../actions";

export const metadata: Metadata = { title: "Esportes" };

const sportLabel = (id: string) => SPORTS.find((s) => s.id === id)?.label ?? id;

export default function SportsPage() {
  return (
    <>
      <PageHeader icon={Trophy} overline="Gestão na nuvem" title="Esportes" integration="connected"
        description="Escolha quais esportes, ligas, países e times aparecem nos dispositivos." />
      <Suspense fallback={<SkeletonCard rows={8} />}>
        <Sports />
      </Suspense>
    </>
  );
}

async function Sports() {
  await requireAdmin();
  const s = await getAccountSettings(await getDb());
  const hidden = new Set(s.hiddenSports);
  return (
    <>
      <div className="grid grid-kpi">
        <Kpi label="Seção de esportes" value={s.sportsEnabled ? "Ativa" : "Oculta"} hint="em todos os dispositivos" color={s.sportsEnabled ? "var(--color-green-500)" : "var(--color-border-strong)"} />
        <Kpi label="Esportes ocultos" value={s.hiddenSports.length} hint={`de ${SPORTS.length} categorias`} />
        <Kpi label="Itens ocultos" value={s.hiddenSportEntries.length} hint="ligas, países ou times" />
      </div>
      <Card>
        <CardHead icon={KeyRound} overline="Dados esportivos" title="Escudos, classificação e placar"
          description="O painel busca nesses serviços e entrega às TVs. Sem chave do TheSportsDB, usa a chave pública grátis (classificação só com os primeiros colocados)." />
        <div className="card-body">
          <ActionForm action={saveSportsDataKeysAction}>
            <div className="form-row">
              <div className="field">
                <label htmlFor="sportsDbKey">Chave do TheSportsDB {s.sportsDbKey ? "(própria, salva)" : "(usando a grátis)"}</label>
                <input id="sportsDbKey" name="sportsDbKey" type="password" className="input" autoComplete="off" placeholder={s.sportsDbKey ? "Em branco mantém a atual" : "Cole a chave do plano Premium"} />
                {s.sportsDbKey && <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="removeSportsDbKey" /> Voltar para a chave grátis</label>}
              </div>
              <div className="field">
                <label htmlFor="apiSportsKey">Chave do API-Sports {s.apiSportsKey ? "(salva)" : "(não configurada)"}</label>
                <input id="apiSportsKey" name="apiSportsKey" type="password" className="input" autoComplete="off" placeholder={s.apiSportsKey ? "Em branco mantém a atual" : "Placar e status ao vivo"} />
                {s.apiSportsKey && <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="removeApiSportsKey" /> Remover chave</label>}
              </div>
            </div>
            <p className="hint">As chaves ficam guardadas criptografadas e nunca são enviadas às TVs.</p>
            <div className="form-actions"><SubmitButton>Salvar chaves</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>
      <div className="grid grid-2">
        <Card>
          <CardHead icon={EyeOff} overline="Categorias" title="Ocultar esportes" description="Esportes marcados somem da navegação do app." />
          <div className="card-body">
            <ActionForm action={saveSportsModeAction}>
              <label className="setting" style={{ cursor: "pointer" }}>
                <span className="s-text"><strong>Mostrar a seção de esportes</strong><span>Desligado, a seção some do app por completo.</span></span>
                <input type="checkbox" className="switch" name="enabled" defaultChecked={s.sportsEnabled} />
              </label>
              <fieldset style={{ border: 0, padding: 0, margin: "16px 0 0" }}>
                <legend className="label" style={{ marginBottom: 8 }}>Esportes ocultos</legend>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                  {SPORTS.map((sp) => (
                    <label key={sp.id} className="setting" style={{ cursor: "pointer", padding: 12 }}>
                      <span className="s-text"><strong>{sp.label}</strong></span>
                      <input type="checkbox" className="switch" name="hiddenSports" value={sp.id} defaultChecked={hidden.has(sp.id)} />
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="form-actions"><SubmitButton>Aplicar</SubmitButton></div>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHead icon={Filter} overline="Ajuste fino" title="Ligas, países e times" description="Oculte itens específicos dentro de um esporte." />
          {s.hiddenSportEntries.length === 0 ? (
            <EmptyState icon={Filter} title="Nada oculto" text="Use o formulário abaixo para ocultar uma liga, um país ou um time." />
          ) : (
            <table className="table">
              <thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">Esporte</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {s.hiddenSportEntries.map((e, i) => (
                  <tr key={`${e.sport}-${e.kind}-${e.name}`}>
                    <td><span className="t-main">{e.name}</span></td>
                    <td data-label="Tipo">{ENTRY_KIND_LABEL[e.kind]}</td>
                    <td data-label="Esporte">{sportLabel(e.sport)}</td>
                    <td className="t-actions">
                      <form action={unhideSportEntryAction}>
                        <input type="hidden" name="index" value={i} />
                        <button className="btn btn-secondary btn-sm">Mostrar de novo</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="card-body" style={{ borderTop: "1px solid var(--color-border)" }}>
            <ActionForm action={hideSportEntryAction} resetOnSuccess>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="sp-sport">Esporte</label>
                  <select id="sp-sport" name="sport" className="input" defaultValue="football">
                    {SPORTS.map((sp) => <option key={sp.id} value={sp.id}>{sp.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sp-kind">Tipo</label>
                  <select id="sp-kind" name="kind" className="input" defaultValue="league">
                    <option value="league">Liga</option>
                    <option value="country">País</option>
                    <option value="team">Time</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="sp-name">Nome</label>
                <input id="sp-name" name="name" className="input" required maxLength={80} placeholder="Ex.: Premier League" />
              </div>
              <div className="form-actions"><SubmitButton>Ocultar</SubmitButton></div>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
