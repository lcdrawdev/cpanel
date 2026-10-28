import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Camera, Info, KeyRound, Layers, ListVideo, Plug, SlidersVertical, MonitorSmartphone, Settings2, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Alert, Card, CardHead, EmptyState, Fact, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { DeviceStatus, PLATFORM_LABEL, PROFILE_PLATFORM_LABEL, formatDate } from "@/components/device-bits";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getDevice, listDevices } from "@/server/services/devices";
import { knownXtreamServers, listPlaylists } from "@/server/services/playlists";
import { listProfiles } from "@/server/services/profiles";
import { listGroups } from "@/server/services/groups";
import { listSnapshots } from "@/server/services/snapshots";
import { OverridesSection, CopiesSection } from "./extra-sections";
import { ServiceError } from "@/server/services/errors";
import { SETTING_GROUPS, resolveSettings } from "@/shared/settings";
import {
  connectDeviceXtreamAction, removeDeviceAction, renameDeviceAction, setDeviceBlockedAction, setDeviceGroupAction, setDevicePlaylistsAction, setDeviceProfileAction,
} from "../../actions";

export const metadata: Metadata = { title: "Painel do dispositivo" };

// Sections of the device panel (reference: MAPA_DE_TELAS 15a–15d).
const SECTIONS = [
  { id: "info", label: "Informações", hint: "Status e identificação", icon: Info },
  { id: "playlists", label: "Playlists", hint: "Conteúdo entregue", icon: ListVideo },
  { id: "configuracoes", label: "Configurações", hint: "Perfil e grupo", icon: Settings2 },
  { id: "ajustes", label: "Ajustes do dispositivo", hint: "Só esta TV", icon: SlidersVertical },
  { id: "copias", label: "Snapshots e cópia", hint: "Salvar, restaurar, copiar", icon: Camera },
  { id: "acoes", label: "Ações", hint: "Bloquear ou remover", icon: ShieldAlert },
] as const;

export default function DevicePanelPage(props: PageProps<"/dispositivos/[id]">) {
  return (
    <Suspense fallback={<SkeletonCard rows={8} />}>
      <DevicePanel {...props} />
    </Suspense>
  );
}

async function DevicePanel({ params, searchParams }: PageProps<"/dispositivos/[id]">) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const section = SECTIONS.find((s) => s.id === sp.secao)?.id ?? "info";
  const db = await getDb();
  let device;
  try {
    device = await getDevice(db, id);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  }

  return (
    <>
      <PageHeader
        icon={MonitorSmartphone}
        overline="Dispositivo selecionado"
        title={device.nickname}
        description={`Device ID ${device.deviceId}`}
        integration="connected"
        actions={<Link href="/dispositivos" className="btn btn-on-dark"><ArrowLeft size={18} aria-hidden="true" /> Todos os dispositivos</Link>}
      />
      <div className="split">
        <nav className="card section-menu" aria-label="Seções do dispositivo">
          <div className="sm-label eyebrow">Gestão</div>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.id} href={`/dispositivos/${id}?secao=${s.id}`} className="section-link" aria-current={s.id === section ? "page" : undefined} scroll={false}>
                <span className="sl-icon" aria-hidden="true"><Icon size={18} /></span>
                <span>{s.label}<small>{s.hint}</small></span>
              </Link>
            );
          })}
        </nav>
        <div className="grid">
          {section === "info" && <InfoSection device={device} servers={await knownXtreamServers(db)} />}
          {section === "playlists" && <PlaylistsSection device={device} all={await listPlaylists(db)} />}
          {section === "configuracoes" && <SettingsSection device={device} profiles={await listProfiles(db)} groups={await listGroups(db)} />}
          {section === "ajustes" && <OverridesSection device={device} />}
          {section === "copias" && <CopiesSection device={device} snapshots={await listSnapshots(db)} devices={await listDevices(db)} />}
          {section === "acoes" && <ActionsSection device={device} />}
        </div>
      </div>
    </>
  );
}

type Device = Awaited<ReturnType<typeof getDevice>>;

function InfoSection({ device, servers }: { device: Device; servers: string[] }) {
  return (
    <>
      <Card>
        <CardHead icon={Info} overline="Dispositivo" title="Informações" description="Identificação, versão do app e último contato." />
        <div className="card-body">
          {device.status === "pending" && (
            <Alert tone="warning">O app ainda não se conectou. Ele aparece como ativo depois da primeira ativação com este Device ID.</Alert>
          )}
          <dl className="facts" style={{ margin: 0 }}>
            <Fact label="Device ID"><span className="mono">{device.deviceId}</span></Fact>
            <Fact label="Status"><DeviceStatus status={device.status} /></Fact>
            <Fact label="Plataforma">{PLATFORM_LABEL[device.platform]}</Fact>
            <Fact label="Modelo">{device.model ?? "—"}</Fact>
            <Fact label="Versão do app">{device.appVersion ?? "—"}</Fact>
            <Fact label="Último contato">{formatDate(device.lastSeenAt)}</Fact>
            <Fact label="Perfil">{device.profile?.name ?? "Nenhum"}</Fact>
            <Fact label="Grupo">{device.group ? <Link href={`/grupos/${device.group.id}`}>{device.group.name}</Link> : "Nenhum"}</Fact>
            <Fact label="Cadastrado em">{formatDate(device.createdAt)}</Fact>
          </dl>
        </div>
      </Card>
      <Card>
        <CardHead icon={SlidersHorizontal} overline="Identificação" title="Apelido e usuário" description="O nome do usuário aparece no perfil, no canto do app." />
        <div className="card-body">
          <ActionForm action={renameDeviceAction}>
            <input type="hidden" name="id" value={device.id} />
            <div className="field">
              <label htmlFor="nickname">Apelido</label>
              <input id="nickname" name="nickname" className="input" defaultValue={device.nickname} required maxLength={60} />
            </div>
            <div className="field">
              <label htmlFor="customerName">Nome do usuário no app</label>
              <input id="customerName" name="customerName" className="input" defaultValue={device.customerName} maxLength={40} placeholder="Ex.: Paulo" />
              <p className="hint">Em branco, o app mostra o apelido do dispositivo.</p>
            </div>
            <div className="form-actions"><SubmitButton>Salvar</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>
      <XtreamLoginCard device={device} servers={servers} />
    </>
  );
}

/** Login XC só desta TV: o painel testa no servidor e entrega ao app na hora (via SSE). */
function XtreamLoginCard({ device, servers }: { device: Device; servers: string[] }) {
  const current = device.playlists.filter((p) => p.type === "xtream");
  return (
    <Card>
      <CardHead icon={KeyRound} overline="Acesso" title="Usuário e senha da lista" description="Login XC do cliente. Ao conectar, o painel testa no servidor e envia para esta TV na hora." />
      <div className="card-body">
        {current.length > 0 && (
          <p className="hint" style={{ marginTop: 0 }}>Lista XC atual nesta TV: {current.map((p) => p.name).join(", ")}. Por segurança, usuário e senha salvos não são mostrados.</p>
        )}
        <ActionForm action={connectDeviceXtreamAction}>
          <input type="hidden" name="id" value={device.id} />
          <div className="field">
            <label htmlFor="xc-url">Servidor (URL do portal)</label>
            <input id="xc-url" name="url" type="url" className="input" list="xc-servers" required defaultValue={current[0]?.url ?? servers[0] ?? ""} placeholder="http://portal.exemplo.com:8080" />
            <datalist id="xc-servers">{servers.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="xc-user">Usuário</label>
              <input id="xc-user" name="username" className="input" autoComplete="off" required />
            </div>
            <div className="field">
              <label htmlFor="xc-pass">Senha</label>
              <input id="xc-pass" name="password" type="password" className="input" autoComplete="new-password" required />
            </div>
          </div>
          <p className="hint">Guardado criptografado. Outras TVs que usam a mesma lista não são alteradas.</p>
          <div className="form-actions"><SubmitButton pendingLabel="Conectando…"><Plug size={18} aria-hidden="true" /> Conectar</SubmitButton></div>
        </ActionForm>
      </div>
    </Card>
  );
}

function PlaylistsSection({ device, all }: { device: Device; all: Awaited<ReturnType<typeof listPlaylists>> }) {
  const linked = new Set(device.playlists.map((p) => p.id));
  return (
    <Card>
      <CardHead icon={ListVideo} overline="Conteúdo" title="Playlists do dispositivo" description="Marque as playlists que este dispositivo deve receber." action={<Link href="/portais" className="btn btn-secondary btn-sm">Gerenciar playlists</Link>} />
      <div className="card-body">
        {all.length === 0 ? (
          <EmptyState icon={ListVideo} title="Nenhuma playlist cadastrada" text="Cadastre uma playlist XC ou M3U em Portais e playlists para entregá-la aos dispositivos." action={<Link href="/portais" className="btn btn-primary">Cadastrar playlist</Link>} />
        ) : (
          <ActionForm action={setDevicePlaylistsAction}>
            <input type="hidden" name="id" value={device.id} />
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="sr-only">Playlists</legend>
              {all.map((p) => (
                <label key={p.id} className="setting" style={{ cursor: "pointer" }}>
                  <span className="s-text"><strong>{p.name}</strong><span>{p.type === "xtream" ? "XC" : "M3U"} · {p.url}</span></span>
                  <input type="checkbox" className="switch" name="playlistIds" value={p.id} defaultChecked={linked.has(p.id)} />
                </label>
              ))}
            </fieldset>
            <div className="form-actions"><SubmitButton>Aplicar</SubmitButton></div>
          </ActionForm>
        )}
      </div>
    </Card>
  );
}

function SettingsSection({ device, profiles, groups }: { device: Device; profiles: Awaited<ReturnType<typeof listProfiles>>; groups: Awaited<ReturnType<typeof listGroups>> }) {
  const settings = resolveSettings(device.profile?.settings);
  return (
    <>
      <Card>
        <CardHead icon={Layers} overline="Grupo" title="Grupo do dispositivo" description="Ao entrar num grupo, o dispositivo recebe o perfil e as playlists do grupo." action={<Link href="/grupos" className="btn btn-secondary btn-sm">Gerenciar grupos</Link>} />
        <div className="card-body">
          <ActionForm action={setDeviceGroupAction}>
            <input type="hidden" name="deviceId" value={device.id} />
            <div className="field">
              <label htmlFor="groupId">Grupo</label>
              <select id="groupId" name="groupId" className="input" defaultValue={device.groupId ?? ""}>
                <option value="">Nenhum</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="form-actions"><SubmitButton>Aplicar grupo</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>
      <Card>
        <CardHead icon={Settings2} overline="Configurações" title="Perfil aplicado" description="As configurações do player vêm de um perfil reutilizável." action={<Link href="/perfis" className="btn btn-secondary btn-sm">Gerenciar perfis</Link>} />
        <div className="card-body">
          <ActionForm action={setDeviceProfileAction}>
            <input type="hidden" name="id" value={device.id} />
            <div className="field">
              <label htmlFor="profileId">Perfil</label>
              <select id="profileId" name="profileId" className="input" defaultValue={device.profileId ?? ""}>
                <option value="">Nenhum (padrões do app)</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} · {PROFILE_PLATFORM_LABEL[p.platform]}</option>)}
              </select>
            </div>
            <div className="form-actions"><SubmitButton>Aplicar perfil</SubmitButton></div>
          </ActionForm>
        </div>
      </Card>
      <Card>
        <CardHead icon={SlidersHorizontal} overline="Resultado" title="O que o dispositivo recebe" description={device.profile ? `Valores do perfil “${device.profile.name}”. Para mudar, edite o perfil.` : "Sem perfil: o dispositivo usa os valores padrão abaixo."}
          action={device.profile ? <Link href={`/perfis/${device.profile.id}`} className="btn btn-primary btn-sm">Editar perfil</Link> : undefined} />
        <div className="card-body">
          {SETTING_GROUPS.map((g) => (
            <div key={g.id} style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{g.title}</div>
              <dl className="facts" style={{ margin: 0 }}>
                {g.fields.map((f) => {
                  const v = settings[f.key as keyof typeof settings];
                  const shown = f.type === "boolean" ? (v ? "Ligado" : "Desligado") : f.type === "select" ? f.options.find((o) => o.value === v)?.label ?? String(v) : String(v);
                  return <Fact key={f.key} label={f.label}>{shown}</Fact>;
                })}
              </dl>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function ActionsSection({ device }: { device: Device }) {
  const blocked = device.status === "blocked";
  return (
    <Card>
      <CardHead icon={ShieldAlert} overline="Ações" title="Controle de acesso" description="Ações que afetam o dispositivo imediatamente." />
      <div className="card-body">
        <div className="setting">
          <div className="s-text">
            <strong>{blocked ? "Desbloquear dispositivo" : "Bloquear dispositivo"}</strong>
            <span>{blocked ? "Permite que o app se ative de novo com este Device ID." : "Revoga o token: o app perde acesso na próxima consulta."}</span>
          </div>
          <ActionForm action={setDeviceBlockedAction}>
            <input type="hidden" name="id" value={device.id} />
            <input type="hidden" name="blocked" value={String(!blocked)} />
            <SubmitButton variant={blocked ? "secondary" : "danger"}>{blocked ? "Desbloquear" : "Bloquear"}</SubmitButton>
          </ActionForm>
        </div>
        <div className="setting">
          <div className="s-text">
            <strong>Remover dispositivo</strong>
            <span>Apaga o cadastro, o vínculo com playlists e o token. Não pode ser desfeito.</span>
          </div>
          <form action={removeDeviceAction}>
            <input type="hidden" name="id" value={device.id} />
            <ConfirmSubmit message={`Remover “${device.nickname}”? Esta ação não pode ser desfeita.`}>Remover</ConfirmSubmit>
          </form>
        </div>
      </div>
    </Card>
  );
}
