"use client";

import { useId } from "react";
import { Plus } from "lucide-react";
import { ActionForm, Modal, SubmitButton } from "./forms";
import { addDeviceAction } from "@/app/(painel)/actions";

export function AddDeviceButton({ className = "btn btn-primary" }: { className?: string }) {
  const uid = useId();
  return (
    <Modal
      triggerClassName={className}
      trigger={<><Plus size={18} aria-hidden="true" /> Adicionar dispositivo</>}
      title="Adicionar dispositivo"
      description="Digite o Device ID exatamente como aparece no app (diferencia maiúsculas e minúsculas)."
    >
      {(close) => (
        <ActionForm action={addDeviceAction} resetOnSuccess>
          <div className="field">
            <label htmlFor={`add-device-id${uid}`}>Device ID</label>
            <input id={`add-device-id${uid}`} name="deviceId" className="input mono" required minLength={6} maxLength={64} placeholder="Ex.: 3f9a1c27b84e0d56" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={`add-device-nick${uid}`}>Apelido</label>
            <input id={`add-device-nick${uid}`} name="nickname" className="input" required maxLength={60} placeholder="Ex.: TV da sala" />
            <p className="hint">Nome que você vai ver nas listas.</p>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={close}>Fechar</button>
            <SubmitButton>Adicionar</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}
