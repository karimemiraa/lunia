"use client";

import { useActionState } from "react";
import type { Room } from "@prisma/client";
import { updateRoomAction, deleteRoomAction, type RoomActionState } from "./actions";
import { ConfirmButton } from "../../_ui/ConfirmDialog";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT } from "../../_i18n/StaffI18n";

const initialState: RoomActionState = {};

const inputClass = "lunia-input min-h-11 w-24 text-base md:text-sm";

// Mirrors admin/tiers/TierRow.tsx: the Name/Capacity/Order/Active inputs are
// spread across separate <td>s but all point at the same <form> via the
// HTML `form` attribute, so a single Save action reads the whole row.
export function RoomRow({ room }: { room: Room }) {
  const [updateState, updateAction, updatePending] = useActionState(updateRoomAction, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRoomAction, initialState);
  const formId = `room-form-${room.id}`;
  const t = useStaffT();

  return (
    <tr className="border-t border-[var(--color-ink)]/10" data-testid="room-row" data-room-name={room.name}>
      <td className="px-4 py-2">
        <form id={formId} action={updateAction}>
          <input type="hidden" name="id" value={room.id} />
          <input
            type="text"
            name="name"
            defaultValue={room.name}
            aria-label={t("{name} name", { name: room.name })}
            className={`${inputClass} w-40`}
          />
          <input
            type="text"
            name="nameAr"
            dir="rtl"
            defaultValue={room.nameAr ?? ""}
            placeholder="الاسم بالعربي"
            aria-label={t("{name} Arabic name", { name: room.name })}
            className={`${inputClass} mt-1 w-40`}
          />
        </form>
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          name="capacity"
          form={formId}
          defaultValue={room.capacity}
          min={1}
          aria-label={t("{name} capacity", { name: room.name })}
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          name="order"
          form={formId}
          defaultValue={room.order}
          aria-label={t("{name} order", { name: room.name })}
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="checkbox"
          name="isActive"
          form={formId}
          defaultChecked={room.isActive}
          aria-label={t("{name} active", { name: room.name })}
          className="h-5 w-5 accent-[var(--color-forest)]"
        />
      </td>
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
        <form action={deleteAction} className="flex flex-col items-start gap-1">
          <input type="hidden" name="id" value={room.id} />
          <ConfirmButton title={t("Delete room “{name}”?", { name: room.name })} description={t("Bookings already assigned to this room keep their time but lose the room. This cannot be undone.")} confirmLabel={t("Delete room")} pending={deletePending}>
            {t("Delete")}
          </ConfirmButton>
          <InlineStatus size="sm" error={deleteState.error} />
        </form>
      </td>
    </tr>
  );
}
