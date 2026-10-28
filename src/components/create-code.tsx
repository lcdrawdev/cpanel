"use client";

import { useId } from "react";
import { Plus } from "lucide-react";
import { ActionForm, Modal, SubmitButton } from "./forms";
import { createCodeAction } from "@/app/(painel)/actions";

export function CreateCodeButton(props: { profiles: { id: string; name: string }[]; playlists: { id: string; name: string }[]; groups: { id: string; name: string }[] }) {
  const uid = useId();
  return (
    <Modal trigger={<><Plus size={18} aria-hidden="true" /> Criar código</>} title="Novo código de ativação" description="Quem digitar o código no app ganha um dispositivo já configurado com o perfil e as playlists abaixo.">
      {(close) => (
        <ActionForm action={createCodeAction} resetOnSuccess>
          <div className="form-row">
            <div className="field">
              <label htmlFor={`code-label${uid}`}>Apelido</label>
              <input id={`code-label${uid}`} name="label" className="input" required maxLength={40} placeholder="Ex.: Loja centro" />
            </div>
            <div className="field">
              <label htmlFor={`code-max${uid}`}>Limite de usos</label>
              <input id={`code-max${uid}`} name="maxUses" type="number" min={1} max={10000} defaultValue={5} className="input" required />
            </div>
          </div>
          <div className="form-row" style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor={`code-profile${uid}`}>Perfil de configuração</label>
              <select id={`code-profile${uid}`} name="profileId" className="input" defaultValue="">
                <option value="">Nenhum</option>
                {props.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`code-exp${uid}`}>Válido até (opcional)</label>
              <input id={`code-exp${uid}`} name="expiresAt" type="date" className="input" />
            </div>
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor={`code-group${uid}`}>Grupo (opcional)</label>
            <select id={`code-group${uid}`} name="groupId" className="input" defaultValue="">
              <option value="">Nenhum</option>
              {props.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <p className="hint">Com grupo, o dispositivo entra no grupo e recebe o perfil e as playlists dele (no lugar dos escolhidos aqui).</p>
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: "16px 0 0" }}>
            <legend className="label" style={{ marginBottom: 6 }}>Playlists entregues</legend>
            {props.playlists.length === 0 ? (
              <p className="hint">Nenhuma playlist cadastrada ainda; o código pode ser criado sem playlists.</p>
            ) : (
              <div className="check-list">
                {props.playlists.map((p) => (
                  <label key={p.id}><input type="checkbox" name="playlistIds" value={p.id} /> {p.name}</label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={close}>Fechar</button>
            <SubmitButton>Gerar código</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}
