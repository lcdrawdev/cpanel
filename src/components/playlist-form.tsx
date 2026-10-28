"use client";

import { useId, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm, Modal, SubmitButton } from "./forms";
import { createPlaylistAction, updatePlaylistAction } from "@/app/(painel)/actions";

type Existing = { id: string; name: string; type: "xtream" | "m3u"; url: string; hasCredentials: boolean };

function Fields({ existing, prefix }: { existing?: Existing; prefix: string }) {
  const [type, setType] = useState<"xtream" | "m3u">(existing?.type ?? "xtream");
  return (
    <>
      {existing && <input type="hidden" name="id" value={existing.id} />}
      <div className="form-row">
        <div className="field">
          <label htmlFor={`${prefix}-name`}>Nome</label>
          <input id={`${prefix}-name`} name="name" className="input" defaultValue={existing?.name} required maxLength={60} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-type`}>Tipo</label>
          <select id={`${prefix}-type`} name="type" className="input" value={type} onChange={(e) => setType(e.target.value as "xtream" | "m3u")}>
            <option value="xtream">XC API (usuário e senha)</option>
            <option value="m3u">M3U (link da lista)</option>
          </select>
        </div>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor={`${prefix}-url`}>{type === "xtream" ? "URL do portal" : "URL da lista M3U"}</label>
        <input id={`${prefix}-url`} name="url" type="url" className="input" defaultValue={existing?.url} required placeholder={type === "xtream" ? "http://portal.exemplo.com:8080" : "https://exemplo.com/lista.m3u"} />
        <p className="hint">Não inclua usuário ou senha na URL.</p>
      </div>
      {type === "xtream" && (
        <div className="form-row" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor={`${prefix}-user`}>Usuário</label>
            <input id={`${prefix}-user`} name="username" className="input" autoComplete="off" required={!existing} placeholder={existing ? "Em branco mantém o atual" : undefined} />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-pass`}>Senha</label>
            <input id={`${prefix}-pass`} name="password" type="password" className="input" autoComplete="new-password" required={!existing} />
            {existing && <p className="hint">Em branco mantém a senha atual.</p>}
          </div>
        </div>
      )}
      <p className="hint" style={{ marginTop: 12 }}>As credenciais são guardadas criptografadas e nunca aparecem no painel depois de salvas.</p>
    </>
  );
}

export function CreatePlaylistButton() {
  const uid = useId();
  return (
    <Modal trigger={<><Plus size={18} aria-hidden="true" /> Adicionar playlist</>} title="Nova playlist" description="Cadastre uma vez e entregue a vários dispositivos.">
      {(close) => (
        <ActionForm action={createPlaylistAction} resetOnSuccess>
          <Fields prefix={`new${uid}`} />
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={close}>Fechar</button>
            <SubmitButton>Salvar</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

export function EditPlaylistButton({ playlist }: { playlist: Existing }) {
  return (
    <Modal triggerClassName="btn btn-secondary btn-sm" trigger={<><Pencil size={16} aria-hidden="true" /> Editar</>} title={`Editar ${playlist.name}`} description="Os dispositivos com esta playlist recebem a mudança na próxima consulta.">
      {(close) => (
        <ActionForm action={updatePlaylistAction}>
          <Fields prefix={`edit-${playlist.id}`} existing={playlist} />
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={close}>Fechar</button>
            <SubmitButton>Salvar alterações</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}
