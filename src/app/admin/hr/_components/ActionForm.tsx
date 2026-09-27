"use client";

import { useActionState, type ReactNode } from "react";

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
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmMessage && !confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={`${buttonClassName} min-h-11 disabled:opacity-60`}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {state.success && <span className="text-sm font-medium text-[var(--color-teal-ink)]">{state.success}</span>}
        {state.error && (
          <span role="alert" className="text-sm font-medium text-red-700">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
