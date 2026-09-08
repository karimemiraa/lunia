"use client";

import { useActionState } from "react";
import { deleteNoteAction, type ClientActionState } from "./actions";

export interface VisitNoteRowData {
  id: string;
  body: string;
  authorName?: string;
  authorUserId: string;
  createdAt: Date;
}

interface VisitNoteRowProps {
  note: VisitNoteRowData;
  clientProfileId: string;
  currentUserId: string;
  canManage: boolean;
}

const initialState: ClientActionState = {};

const CENTER_TZ = "Asia/Riyadh";

function formatNoteDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" }).format(date);
}

// A delete button is shown only when the current admin wrote the note, or
// holds CLIENT_MANAGE -- deleteNoteAction re-checks the same rule
// server-side regardless (see actions.ts), so this is a UI convenience, not
// the security boundary.
export function VisitNoteRow({ note, clientProfileId, currentUserId, canManage }: VisitNoteRowProps) {
  const [state, action, pending] = useActionState(deleteNoteAction, initialState);
  const canDelete = canManage || note.authorUserId === currentUserId;

  return (
    <li
      className="flex flex-col gap-2 rounded border border-[var(--color-ink)]/10 p-4"
      data-testid="visit-note"
      data-note-id={note.id}
    >
      <p className="whitespace-pre-wrap text-sm text-[var(--color-ink)]">{note.body}</p>
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-ink)]/60">
        <span>
          {note.authorName ?? "Unknown staff"} &middot; {formatNoteDate(note.createdAt)}
        </span>
        {canDelete && (
          <form
            action={action}
            onSubmit={(event) => {
              if (!confirm("Delete this visit note? This cannot be undone.")) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="noteId" value={note.id} />
            <input type="hidden" name="clientProfileId" value={clientProfileId} />
            <button
              type="submit"
              disabled={pending}
              className="rounded border border-red-600/30 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </form>
        )}
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </li>
  );
}
