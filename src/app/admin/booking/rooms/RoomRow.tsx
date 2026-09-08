"use client";

import { useActionState } from "react";
import type { Room } from "@prisma/client";
import { updateRoomAction, deleteRoomAction, type RoomActionState } from "./actions";

const initialState: RoomActionState = {};

const inputClass =
  "w-24 rounded border border-[var(--color-ink)]/20 px-2 py-1 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

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
          className="h-4 w-4"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col items-start gap-1">
          <button
            type="submit"
            form={formId}
            disabled={updatePending}
            className="rounded bg-[var(--color-teal)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {updatePending ? "Saving…" : "Save"}
          </button>
          {updateState.error && (
            <p role="alert" className="text-xs text-red-600">
              {updateState.error}
            </p>
          )}
          {updateState.success && <p className="text-xs text-[var(--color-teal)]">Saved.</p>}
        </div>
      </td>
      <td className="px-4 py-2">
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!confirm(`Delete room "${room.name}"? This cannot be undone.`)) {
              event.preventDefault();
            }
          }}
          className="flex flex-col items-start gap-1"
        >
          <input type="hidden" name="id" value={room.id} />
          <button
            type="submit"
            disabled={deletePending}
            className="rounded border border-red-600/30 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {deletePending ? "Deleting…" : "Delete"}
          </button>
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
