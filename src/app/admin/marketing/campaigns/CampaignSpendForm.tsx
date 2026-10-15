"use client";

import { useActionState } from "react";
import { Field } from "../../_components/Field";
import { upsertCampaignSpendAction, type CampaignSpendActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT } from "../../_i18n/StaffI18n";

const initialState: CampaignSpendActionState = {};

// Upserts a CampaignSpend row keyed by (channel, periodMonth): submitting the
// same channel + month again overwrites that month's spend rather than
// creating a duplicate row, matching campaigns.ts's upsert semantics.
export function CampaignSpendForm() {
  const [state, action, pending] = useActionState(upsertCampaignSpendAction, initialState);
  const t = useStaffT();

  return (
    <form
      action={action}
      data-testid="campaign-spend-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Add / update spend")}</h2>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t("Channel")} name="channel" dir="ltr" placeholder={t("e.g. {example}", { example: "instagram" })} required />
        <Field label={t("Period Month")} name="periodMonth" dir="ltr" placeholder="YYYY-MM" required />
        <Field label={t("Amount (SAR)")} name="amountSar" type="number" step="0.01" placeholder="0.00" required />
        <Field label={t("Note")} name="note" placeholder={t("Optional")} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Saving…") : t("Save spend")}
        </button>
        <InlineStatus success={state.success ? t("Saved.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
