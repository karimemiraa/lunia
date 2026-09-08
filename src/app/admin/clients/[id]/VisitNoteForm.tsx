"use client";

import { useActionState, useId, useRef } from "react";
import { addNoteAction, type ClientActionState } from "./actions";

interface VisitNoteFormProps {
  clientProfileId: string;
}

const initialState: ClientActionState = {};

const textareaClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

// Only rendered when the current admin holds VISITNOTE_WRITE (see
// [id]/page.tsx) -- addNoteAction re-checks that permission itself
// regardless, so this component never has to be trusted as the sole gate.
export function VisitNoteForm({ clientProfileId }: VisitNoteFormProps) {
  const [state, action, pending] = useActionState(addNoteAction, initialState);
  const bodyId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      data-testid="visit-note-form"
      className="flex flex-col gap-3 rounded border border-[var(--color-ink)]/10 p-4"
    >
      <input type="hidden" name="clientProfileId" value={clientProfileId} />
      <label htmlFor={bodyId} className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Add visit note</span>
        <textarea id={bodyId} name="body" required rows={3} className={textareaClass} placeholder="Clinical notes, observations, follow-up..." />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add note"}
        </button>
        {state.success && <p className="text-sm text-[var(--color-teal)]">Note added.</p>}
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
