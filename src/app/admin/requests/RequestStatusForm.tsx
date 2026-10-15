"use client";

import { useActionState } from "react";
import { updateEditRequestStatusAction, type RequestStatusState } from "./actions";
import { InlineStatus, SubmitButton } from "../_ui/Form";
import { onActionSuccess } from "../_components/onActionSuccess";
import { toast } from "../_components/toast";
import { useStaffT } from "../_i18n/StaffI18n";
import { translateStatus } from "../_ui/labels";

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
  { value: "DECLINED", label: "Declined" },
];

const initial: RequestStatusState = {};

export function RequestStatusForm({ id, status, note }: { id: string; status: string; note: string | null }) {
  const t = useStaffT();
  // A toast, because a closed request leaves the "Open & in progress" list (and this form with it).
  const [state, action] = useActionState(
    onActionSuccess(updateEditRequestStatusAction, () => toast({ title: t("Request updated"), tone: "success" })),
    initial,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid={`request-status-form-${id}`}>
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Status")}</span>
        <select name="status" defaultValue={status} className="lunia-input py-1.5 text-sm" data-testid="request-status-select">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {translateStatus(o.label, t)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs">
        <span className="font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Reply to the requester (optional)")}</span>
        <input name="resolutionNote" defaultValue={note ?? ""} maxLength={2000} className="lunia-input py-1.5 text-sm" placeholder={t("e.g. Done — the button is now on the invoice page")} />
      </label>
      <SubmitButton size="sm" pendingLabel={t("Saving…")}>
        {t("Update")}
      </SubmitButton>
      <InlineStatus size="sm" success={state.success ? t("Saved") : undefined} error={state.error} />
    </form>
  );
}
