"use client";

import { useActionState } from "react";
import { updateTierAction, deleteTierAction, type TierActionState } from "./actions";
import type { MembershipTier } from "@prisma/client";
import { ConfirmButton } from "../_ui/ConfirmDialog";
import { InlineStatus } from "../_ui/Form";
import { useStaffT, useStaffLocale } from "../_i18n/StaffI18n";

const initialState: TierActionState = {};

const inputClass = "lunia-input min-h-11 w-24 text-base md:text-sm";

// The Name/Priority/Discount inputs are spread across separate <td>s but all
// point at the same <form> via the HTML `form` attribute (valid HTML5), so a
// single Save action reads the whole row while the markup stays a plain
// table row.
export function TierRow({ tier }: { tier: MembershipTier }) {
  const t = useStaffT();
  const locale = useStaffLocale();
  const tierName = locale === "ar" && tier.nameAr ? tier.nameAr : tier.name;
  const [updateState, updateAction, updatePending] = useActionState(updateTierAction, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteTierAction, initialState);
  const formId = `tier-form-${tier.id}`;

  return (
    <tr className="border-t border-[var(--color-ink)]/10" data-testid="tier-row" data-tier-key={tier.key}>
      <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]" dir="ltr">
        {tier.key}
      </td>
      <td className="px-4 py-2">
        <form id={formId} action={updateAction}>
          <input type="hidden" name="id" value={tier.id} />
          <input
            type="text"
            name="name"
            defaultValue={tier.name}
            aria-label={t("{key} name", { key: tier.key })}
            className={`${inputClass} w-40`}
          />
          <input
            type="text"
            name="nameAr"
            dir="rtl"
            defaultValue={tier.nameAr ?? ""}
            placeholder="الاسم بالعربي"
            aria-label={t("{key} Arabic name", { key: tier.key })}
            className={`${inputClass} mt-1 w-40`}
          />
        </form>
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          name="priority"
          form={formId}
          defaultValue={tier.priority}
          aria-label={t("{key} priority", { key: tier.key })}
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          name="discountPct"
          form={formId}
          defaultValue={tier.discountPct}
          aria-label={t("{key} discount percent", { key: tier.key })}
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2 text-[var(--color-ink)]">{tier.isSystem ? t("Yes") : t("No")}</td>
      <td className="px-4 py-2">
        <div className="flex flex-col items-start gap-1">
          <button type="submit" form={formId} disabled={updatePending} aria-busy={updatePending || undefined} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-11 disabled:opacity-60">
            {updatePending ? t("Saving…") : t("Save")}
          </button>
          <InlineStatus size="sm" error={updateState.error} />
          <InlineStatus size="sm" success={updateState.success ? t("Saved.") : undefined} />
        </div>
      </td>
      <td className="px-4 py-2">
        {tier.isSystem ? (
          <span className="text-xs text-[var(--color-ink)]/45">{t("System tier")}</span>
        ) : (
          <form action={deleteAction} className="flex flex-col items-start gap-1">
            <input type="hidden" name="id" value={tier.id} />
            <ConfirmButton
              title={t("Delete tier “{name}”?", { name: tierName })}
              description={t("Customers on this tier fall back to the default tier. This cannot be undone.")}
              confirmLabel={t("Delete tier")}
              pending={deletePending}
            >
              {t("Delete")}
            </ConfirmButton>
            <InlineStatus size="sm" error={deleteState.error} />
          </form>
        )}
      </td>
    </tr>
  );
}
