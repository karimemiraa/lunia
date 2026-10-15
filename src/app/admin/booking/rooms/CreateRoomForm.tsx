"use client";

import { useActionState } from "react";
import { Field } from "../../_components/Field";
import { createRoomAction, type RoomActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT } from "../../_i18n/StaffI18n";

const initialState: RoomActionState = {};

export function CreateRoomForm() {
  const [state, action, pending] = useActionState(createRoomAction, initialState);
  const t = useStaffT();

  return (
    <form
      action={action}
      data-testid="create-room-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Create room")}</h2>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t("Name")} name="name" placeholder={t("e.g. Treatment Room 3")} required />
        <Field label={t("Name (Arabic)")} name="nameAr" placeholder="مثال: غرفة العلاج 3" dir="rtl" />
        <Field label={t("Capacity")} name="capacity" type="number" placeholder="1" />
        <Field label={t("Order")} name="order" type="number" placeholder="0" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Creating…") : t("Create room")}
        </button>
        <InlineStatus success={state.success ? t("Created.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
