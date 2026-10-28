"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "./ui";

export type ActionResult = { ok?: string; error?: string } | undefined;
export type FormAction = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** Form bound to a server action; shows its success/error message inline. */
export function ActionForm(props: { action: FormAction; children: ReactNode; className?: string; onSuccess?: () => void; resetOnSuccess?: boolean }) {
  const [state, formAction] = useActionState(props.action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const { onSuccess, resetOnSuccess } = props;
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
  }, [state, onSuccess, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={props.className} noValidate={false}>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.ok}</Alert>}
      {props.children}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", className = "", pendingLabel = "Salvando…" }: { children: ReactNode; variant?: string; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn-${variant} ${className}`} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Button that asks for confirmation before submitting its parent form. */
export function ConfirmSubmit({ children, message, variant = "danger" }: { children: ReactNode; message: string; variant?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn btn-${variant}`}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Native <dialog> modal: focus is trapped by the browser and Esc closes it. */
export function Modal(props: { trigger: ReactNode; triggerClassName?: string; title: string; description?: string; children: (close: () => void) => ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" className={props.triggerClassName ?? "btn btn-primary"} onClick={() => setOpen(true)}>
        {props.trigger}
      </button>
      <dialog ref={ref} className="modal" aria-labelledby={titleId} onClose={close}>
        <div className="modal-head">
          <h2 id={titleId}>{props.title}</h2>
          {props.description && <p>{props.description}</p>}
        </div>
        <div className="modal-body">{props.children(close)}</div>
      </dialog>
    </>
  );
}
