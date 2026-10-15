"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";
import { Field } from "../_components/Field";
import { createRoleAction, type RoleActionState } from "./actions";
import { onActionSuccess } from "../_components/onActionSuccess";
import { InlineStatus } from "../_ui/Form";
import { useStaffT } from "../_i18n/StaffI18n";

const initialState: RoleActionState = {};

export function CreateRoleForm() {
  const t = useStaffT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    onActionSuccess(createRoleAction, () => {
      setOpen(false);
      router.refresh();
    }),
    initialState,
  );


  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lunia-btn bg-[var(--color-cream)] text-[var(--color-forest)] hover:bg-white"
        data-testid="create-role-trigger"
      >
        {t("Create role")}
      </button>

      {open && (
        <Modal title={t("Create a role")} onClose={() => setOpen(false)}>
          <form action={action} data-testid="create-role-form" className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("Key")} name="key" placeholder={t("e.g. front-desk")} dir="ltr" required />
              <Field label={t("Name")} name="name" placeholder={t("e.g. Front Desk")} required />
            </div>
            <p className="text-xs text-[var(--color-ink)]/45">{t("The key is a lowercase identifier (letters, digits, hyphens). You set permissions after creating it.")}</p>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
                {pending ? t("Creating…") : t("Create role")}
              </button>
              <InlineStatus error={state.error} />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
