"use client";

import { useActionState, useId, useRef } from "react";
import { adjustLoyaltyPointsAction, type ClientActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT } from "../../_i18n/StaffI18n";

interface LoyaltyAdjustFormProps {
  clientProfileId: string;
}

const initialState: ClientActionState = {};

const inputClass =
  "rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

// Only rendered when the current admin holds CLIENT_MANAGE (see
// [id]/page.tsx) -- adjustLoyaltyPointsAction re-checks that permission
// itself regardless, mirroring TierEditor/NotificationPreferenceEditor.
export function LoyaltyAdjustForm({ clientProfileId }: LoyaltyAdjustFormProps) {
  const t = useStaffT();
  const [state, action, pending] = useActionState(adjustLoyaltyPointsAction, initialState);
  const pointsId = useId();
  const reasonId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      data-testid="loyalty-adjust-form"
      className="flex flex-wrap items-end gap-3 lunia-card p-5"
    >
      <input type="hidden" name="clientProfileId" value={clientProfileId} />
      <label htmlFor={pointsId} className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">{t("Points (+/-)")}</span>
        <input
          id={pointsId}
          name="deltaPoints"
          type="number"
          dir="ltr"
          step={1}
          required
          placeholder={t("e.g. 100 or -50")}
          className={`${inputClass} w-36`}
        />
      </label>
      <label htmlFor={reasonId} className="flex flex-1 min-w-[12rem] flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">{t("Reason")}</span>
        <input id={reasonId} name="reason" type="text" required placeholder={t("e.g. Goodwill credit")} className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="lunia-btn lunia-btn-primary disabled:opacity-60"
      >
        {pending ? t("Saving…") : t("Apply adjustment")}
      </button>
      <InlineStatus success={state.success ? t("Saved.") : undefined} />
      <InlineStatus error={state.error} />
    </form>
  );
}
