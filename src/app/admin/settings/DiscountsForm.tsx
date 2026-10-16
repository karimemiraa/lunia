"use client";

import { useActionState } from "react";
import { saveDiscountsAction, type SaveSettingsState } from "./actions";
import { InlineStatus, SubmitButton } from "../_ui/Form";
import type { DiscountSettings } from "@/modules/cms/settings";
import { useStaffT } from "../_i18n/StaffI18n";

const initial: SaveSettingsState = {};

/** Settings → Discounts: how much a specialist may give without a manager. */
export function DiscountsForm({ value }: { value: DiscountSettings }) {
  const [state, action] = useActionState(saveDiscountsAction, initial);
  const t = useStaffT();
  return (
    <section className="flex flex-col gap-5 lunia-card p-5" data-testid="discount-settings">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Discounts")}</h2>
        <p className="text-sm text-[var(--color-ink)]/65">{t("Specialists can discount their own customers up to this limit; anything above goes to a manager to approve. A person's HR file can set her own limit.")}</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("Without approval, up to (%)")}
            <input name="specialistCapPct" type="number" min={0} max={100} defaultValue={value.specialistCapPct} className="lunia-input !w-24 shrink-0 py-1 text-sm" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("And at most (SAR, optional)")}
            <input name="maxSar" type="number" min={0} step="1" defaultValue={value.maxMinor === null ? "" : value.maxMinor / 100} className="lunia-input !w-24 shrink-0 py-1 text-sm" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel={t("Saving…")}>{t("Save discount settings")}</SubmitButton>
          <InlineStatus success={state.success ? t("Saved") : undefined} error={state.error} />
        </div>
      </form>
    </section>
  );
}
