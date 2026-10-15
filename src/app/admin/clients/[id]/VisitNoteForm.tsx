"use client";

import { useActionState, useId, useRef } from "react";
import { addNoteAction, type ClientActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT } from "../../_i18n/StaffI18n";

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
  const t = useStaffT();
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
      className="flex flex-col gap-3 lunia-card p-5"
    >
      <input type="hidden" name="clientProfileId" value={clientProfileId} />
      <label htmlFor={bodyId} className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">{t("Add comment")}</span>
        <textarea id={bodyId} name="body" required rows={3} className={textareaClass} placeholder={t("Observations, preferences, follow-up, front-desk notes...")} />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="w-fit lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Saving…") : t("Add comment")}
        </button>
        <InlineStatus success={state.success ? t("Comment added.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
