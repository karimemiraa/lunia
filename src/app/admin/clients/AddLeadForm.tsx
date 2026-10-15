"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";
import { createLeadAction, type RosterActionState } from "./actions";
import { onActionSuccess } from "../_components/onActionSuccess";
import { InlineStatus } from "../_ui/Form";
import { useStaffT } from "../_i18n/StaffI18n";

interface StaffOption {
  id: string;
  name: string;
}

const initial: RosterActionState = {};

// "Add lead" opens a popup so telesales can log someone they're reaching out to
// (outbound) or a new inbound enquiry, without leaving the roster.
// `autoOpen` (from ?add=lead — the palette, shortcuts and Ask Lunia link here)
// opens the popup straight away.
export function AddLeadForm({ staff, autoOpen = false }: { staff: StaffOption[]; autoOpen?: boolean }) {
  const router = useRouter();
  const t = useStaffT();
  const [open, setOpen] = useState(autoOpen);
  // Drop ?add=lead once used so a refresh/back doesn't pop the form again.
  useEffect(() => {
    if (!autoOpen) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [autoOpen]);
  const [state, action, pending] = useActionState(
    onActionSuccess(createLeadAction, () => {
      setOpen(false);
      router.refresh();
    }),
    initial,
  );


  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lunia-btn lunia-btn-forest" data-testid="add-lead-trigger">
        {t("Add lead")}
      </button>

      {open && (
        <Modal title={t("Add a lead")} onClose={() => setOpen(false)}>
          <form action={action} className="flex flex-col gap-4" data-testid="add-lead-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Name")}</span>
                <input name="fullName" type="text" required maxLength={120} className="lunia-input" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Phone")}</span>
                <input name="phone" type="tel" dir="ltr" maxLength={40} className="lunia-input" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Email (optional)")}</span>
                <input name="email" type="email" dir="ltr" maxLength={200} className="lunia-input" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Source")}</span>
                <input name="source" type="text" maxLength={80} placeholder={t("e.g. whatsapp campaign, cold call")} className="lunia-input" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Channel")}</span>
                <select name="direction" defaultValue="OUTBOUND" className="lunia-input">
                  <option value="OUTBOUND">{t("Outbound (we reached out)")}</option>
                  <option value="INBOUND">{t("Inbound (they came to us)")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Assign to")}</span>
                <select name="ownerId" defaultValue="" className="lunia-input">
                  <option value="">{t("Me")}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-[var(--color-ink)]/45">{t("A phone or email is required so you can reach them.")}</p>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
                {pending ? t("Adding…") : t("Add lead")}
              </button>
              <InlineStatus size="sm" error={state.error} />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
