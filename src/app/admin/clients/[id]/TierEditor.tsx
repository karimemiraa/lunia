"use client";

import { useActionState, useId } from "react";
import { updateTierAction, type ClientActionState } from "./actions";
import type { MembershipTier } from "@prisma/client";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT, useStaffLocale } from "../../_i18n/StaffI18n";

interface TierEditorProps {
  clientProfileId: string;
  currentTierId: string | null;
  tiers: MembershipTier[];
}

const initialState: ClientActionState = {};

const selectClass =
  "rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

// Only rendered when the current admin holds CLIENT_MANAGE (see
// [id]/page.tsx) -- updateTierAction re-checks that permission itself
// regardless, so this component never has to be trusted as the sole gate.
export function TierEditor({ clientProfileId, currentTierId, tiers }: TierEditorProps) {
  const t = useStaffT();
  const ar = useStaffLocale() === "ar";
  const [state, action, pending] = useActionState(updateTierAction, initialState);
  const selectId = useId();

  return (
    <form action={action} className="flex flex-wrap items-end gap-3" data-testid="tier-editor">
      <input type="hidden" name="clientProfileId" value={clientProfileId} />
      <label htmlFor={selectId} className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">{t("Membership tier")}</span>
        <select id={selectId} name="tierId" defaultValue={currentTierId ?? ""} className={selectClass}>
          <option value="">{t("No tier (guest)")}</option>
          {tiers.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {ar ? tier.nameAr || tier.name : tier.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="lunia-btn lunia-btn-primary disabled:opacity-60"
      >
        {pending ? t("Saving…") : t("Save tier")}
      </button>
      <InlineStatus success={state.success ? t("Saved.") : undefined} />
      <InlineStatus error={state.error} />
    </form>
  );
}
