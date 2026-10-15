"use client";

import { useActionState } from "react";
import { Field } from "../_components/Field";
import { createTierAction, type TierActionState } from "./actions";
import { InlineStatus } from "../_ui/Form";
import { useStaffT } from "../_i18n/StaffI18n";

const initialState: TierActionState = {};

export function CreateTierForm() {
  const t = useStaffT();
  const [state, action, pending] = useActionState(createTierAction, initialState);

  return (
    <form
      action={action}
      data-testid="create-tier-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Create tier")}</h2>
      <div className="grid gap-4 sm:grid-cols-5">
        <Field label={t("Key")} name="key" placeholder={t("e.g. gold")} dir="ltr" required />
        <Field label={t("Name")} name="name" placeholder={t("e.g. Gold")} required />
        <Field label={t("Name (Arabic)")} name="nameAr" placeholder="مثال: ذهبية" dir="rtl" />
        <Field label={t("Priority")} name="priority" type="number" placeholder="0" />
        <Field label={t("Discount %")} name="discountPct" type="number" placeholder="0" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Creating…") : t("Create tier")}
        </button>
        <InlineStatus success={state.success ? t("Created.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
