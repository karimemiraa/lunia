"use client";

import { useActionState } from "react";
import type { Room } from "@prisma/client";
import { updateRoomAction, deleteRoomAction, type RoomActionState } from "./actions";
import { ConfirmButton } from "../../_ui/ConfirmDialog";

const initialState: RoomActionState = {};

const inputClass = "lunia-input min-h-11 w-24 text-base md:text-sm";

// Mirrors admin/tiers/TierRow.tsx: the Name/Capacity/Order/Active inputs are
// spread across separate <td>s but all point at the same <form> via the
// HTML `form` attribute, so a single Save action reads the whole row.
export function RoomRow({ room }: { room: Room }) {
  const [updateState, updateAction, updatePending] = useActionState(updateRoomAction, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRoomAction, initialState);
  const formId = `room-form-${room.id}`;

  return (
    <tr className="border-t border-[var(--color-ink)]/10" data-testid="room-row" data-room-name={room.name}>
      <td className="px-4 py-2">
        <form id={formId} action={updateAction}>
          <input type="hidden" name="id" value={room.id} />
          <input
            type="text"
            name="name"
            defaultValue={room.name}
            aria-label={`${room.name} name`}
            className={`${inputClass} w-40`}
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
          aria-label={`${room.name} capacity`}
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          name="order"
          form={formId}
          defaultValue={room.order}
          aria-label={`${room.name} order`}
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="checkbox"
          name="isActive"
          form={formId}
          defaultChecked={room.isActive}
          aria-label={`${room.name} active`}
          className="h-5 w-5 accent-[var(--color-forest)]"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col items-start gap-1">
          <button type="submit" form={formId} disabled={updatePending} aria-busy={updatePending || undefined} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-11 disabled:opacity-60">
            {updatePending ? "Saving…" : "Save"}
          </button>
          {updateState.error && (
            <p role="alert" className="text-xs text-red-600">
              {updateState.error}
            </p>
          )}
          {updateState.success && <p role="status" className="text-xs font-medium text-[var(--status-success-ink)]">Saved.</p>}
        </div>
      </td>
      <td className="px-4 py-2">
        <form action={deleteAction} className="flex flex-col items-start gap-1">
          <input type="hidden" name="id" value={room.id} />
          <ConfirmButton title={`Delete room “${room.name}”?`} description="Bookings already assigned to this room keep their time but lose the room. This cannot be undone." confirmLabel="Delete room" pending={deletePending}>
            Delete
          </ConfirmButton>
          {deleteState.error && (
            <p role="alert" className="text-xs text-red-600">
              {deleteState.error}
            </p>
          )}
        </form>
      </td>
    </tr>
  );
}
