"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_components/Modal";
import { updateCustomerAction, deleteCustomerAction, type ClientActionState } from "./actions";
import { useActionState } from "react";
import { TierEditor } from "./TierEditor";
import { NotificationPreferenceEditor } from "./NotificationPreferenceEditor";
import type { MembershipTier, CommsChannelPref } from "@prisma/client";
import { onActionSuccess } from "../../_components/onActionSuccess";
import { InlineStatus } from "../../_ui/Form";
import { ConfirmButton } from "../../_ui/ConfirmDialog";
import { useStaffT } from "../../_i18n/StaffI18n";

interface CustomerEditorProps {
  clientProfileId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  currentTierId: string | null;
  tiers: MembershipTier[];
  preference: { channel: CommsChannelPref; remindersOptIn: boolean; postVisitOptIn: boolean; marketingOptIn: boolean };
}

const initialState: ClientActionState = {};

// "Edit details" opens a popup with the edit form + delete, so staff aren't
// scrolling past a big inline form on the profile.
export function CustomerEditor({ clientProfileId, fullName, phone, email, source, currentTierId, tiers, preference }: CustomerEditorProps) {
  const router = useRouter();
  const t = useStaffT();
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, savePending] = useActionState(
    onActionSuccess(updateCustomerAction, () => {
      setOpen(false);
      router.refresh();
    }),
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCustomerAction, initialState);


  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lunia-btn lunia-btn-forest-outline" data-testid="edit-customer-trigger">
        {t("Edit details")}
      </button>

      {open && (
        <Modal title={t("Edit customer")} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-5" data-testid="customer-editor">
            <form action={saveAction} className="flex flex-col gap-4">
              <input type="hidden" name="clientProfileId" value={clientProfileId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Name")}</span>
                  <input name="fullName" type="text" required maxLength={120} defaultValue={fullName} className="lunia-input" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Phone")}</span>
                  <input name="phone" type="tel" dir="ltr" maxLength={40} defaultValue={phone ?? ""} className="lunia-input" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Email")}</span>
                  <input name="email" type="email" dir="ltr" maxLength={200} defaultValue={email ?? ""} className="lunia-input" />
                </label>
              </div>
              <p className="text-xs text-[var(--color-ink)]/45">
                {t("Source:")} <span className="font-medium text-[var(--color-ink)]/70">{source || t("Not set")}</span> {t("(set automatically)")}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={savePending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
                  {savePending ? t("Saving…") : t("Save details")}
                </button>
                <InlineStatus size="sm" error={saveState.error} />
              </div>
            </form>

            <hr className="border-[var(--line)]" />

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Membership tier")}</span>
              <TierEditor clientProfileId={clientProfileId} currentTierId={currentTierId} tiers={tiers} />
            </div>

            <hr className="border-[var(--line)]" />

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">{t("Notification preferences")}</span>
              <NotificationPreferenceEditor clientProfileId={clientProfileId} preference={preference} />
            </div>

            <hr className="border-[var(--line)]" />

            <form action={deleteAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="clientProfileId" value={clientProfileId} />
              <ConfirmButton
                title={t("Delete this customer?")}
                description={t("Their bookings and entire history are removed permanently. This cannot be undone.")}
                confirmLabel={t("Delete customer")}
                pending={deletePending}
                className="lunia-btn lunia-btn-danger lunia-btn-sm"
              >
                {deletePending ? t("Deleting…") : t("Delete customer")}
              </ConfirmButton>
              <span className="text-xs text-[var(--color-ink)]/50">{t("Removes the customer and their entire history permanently.")}</span>
              <InlineStatus size="sm" error={deleteState.error} />
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
