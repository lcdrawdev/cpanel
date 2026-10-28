import { PROFILE_PLATFORM_LABEL } from "@/components/device-bits";

type Option = { id: string; name: string };

/** Name, profile and playlists of a group; shared by the create and edit forms. */
export function GroupFields(props: {
  prefix: string;
  profiles: (Option & { platform: string })[];
  playlists: (Option & { type: string })[];
  defaults?: { name: string; profileId: string | null; playlistIds: string[] };
}) {
  const selected = new Set(props.defaults?.playlistIds ?? []);
  return (
    <>
      <div className="form-row">
        <div className="field">
          <label htmlFor={`${props.prefix}-name`}>Nome do grupo</label>
          <input id={`${props.prefix}-name`} name="name" className="input" required maxLength={60} defaultValue={props.defaults?.name} placeholder="Ex.: Loja centro" />
        </div>
        <div className="field">
          <label htmlFor={`${props.prefix}-profile`}>Perfil de configuração</label>
          <select id={`${props.prefix}-profile`} name="profileId" className="input" defaultValue={props.defaults?.profileId ?? ""}>
            <option value="">Nenhum (padrões do app)</option>
            {props.profiles.map((p) => <option key={p.id} value={p.id}>{p.name} · {PROFILE_PLATFORM_LABEL[p.platform]}</option>)}
          </select>
        </div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: "16px 0 0" }}>
        <legend className="label" style={{ marginBottom: 8 }}>Playlists do grupo</legend>
        {props.playlists.length === 0 ? (
          <p className="hint">Nenhuma playlist cadastrada. Você pode criar o grupo agora e escolher as playlists depois.</p>
        ) : (
          props.playlists.map((p) => (
            <label key={p.id} className="setting" style={{ cursor: "pointer" }}>
              <span className="s-text"><strong>{p.name}</strong><span>{p.type === "xtream" ? "XC API" : "M3U"}</span></span>
              <input type="checkbox" className="switch" name="playlistIds" value={p.id} defaultChecked={selected.has(p.id)} />
            </label>
          ))
        )}
      </fieldset>
    </>
  );
}
