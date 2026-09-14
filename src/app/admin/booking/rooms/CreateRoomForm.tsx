"use client";

import { useActionState } from "react";
import { Field } from "../../_components/Field";
import { createRoomAction, type RoomActionState } from "./actions";

const initialState: RoomActionState = {};

export function CreateRoomForm() {
  const [state, action, pending] = useActionState(createRoomAction, initialState);

  return (
    <form
      action={action}
      data-testid="create-room-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Create room</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" name="name" placeholder="e.g. Treatment Room 3" required />
        <Field label="Capacity" name="capacity" type="number" placeholder="1" />
        <Field label="Order" name="order" type="number" placeholder="0" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create room"}
        </button>
        {state.success && <p className="text-sm text-[var(--color-teal)]">Created.</p>}
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
