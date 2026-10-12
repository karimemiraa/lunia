"use client";

import { useActionState, type ReactNode } from "react";
import { InlineStatus } from "../../_ui/Form";
import { ConfirmButton } from "../../_ui/ConfirmDialog";

// Shared state shape for HR server actions driven by <ActionForm>.
export interface FormState {
  error?: string;
  success?: string;
}

interface ActionFormProps {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
  /** Asks for confirmation before submitting (irreversible steps). */
  confirmMessage?: string;
}

// A form wired to a server action with inline pending / error / success
// feedback, so each HR screen doesn't re-implement useActionState plumbing.
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  className = "",
  buttonClassName = "lunia-btn lunia-btn-forest",
  confirmMessage,
}: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        {confirmMessage ? (
          // Irreversible steps ask first, in the in-app dialog (no window.confirm).
          <ConfirmButton
            title={confirmMessage}
            confirmLabel={submitLabel}
            danger={buttonClassName.includes("danger") || /^delete/i.test(confirmMessage)}
            pending={pending}
            className={`${buttonClassName} min-h-11`}
          >
            {pending ? pendingLabel : submitLabel}
          </ConfirmButton>
        ) : (
          <button type="submit" disabled={pending} className={`${buttonClassName} min-h-11 disabled:opacity-60`}>
            {pending ? pendingLabel : submitLabel}
          </button>
        )}
        <InlineStatus size="sm" success={state.success} />
        <InlineStatus size="sm" error={state.error} />
      </div>
    </form>
  );
}
