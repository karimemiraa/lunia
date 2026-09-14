"use client";

import { useActionState } from "react";
import { deleteNoteAction, toggleNotePinAction, type ClientActionState } from "./actions";

export interface VisitNoteRowData {
  id: string;
  body: string;
  authorName?: string;
  authorUserId: string;
  createdAt: Date;
  pinned: boolean;
}

interface VisitNoteRowProps {
  note: VisitNoteRowData;
  clientProfileId: string;
  currentUserId: string;
  canManage: boolean;
  /** Whether the current admin can pin/unpin (holds VISITNOTE_WRITE). */
  canWrite: boolean;
}

const initialState: ClientActionState = {};

const CENTER_TZ = "Asia/Riyadh";

function formatNoteDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" }).format(date);
}

// A delete button is shown only when the current admin wrote the comment, or
// holds CLIENT_MANAGE -- deleteNoteAction re-checks the same rule server-side
// regardless (see actions.ts), so this is a UI convenience, not the security
// boundary. Pinning is available to anyone who can write comments.
export function VisitNoteRow({ note, clientProfileId, currentUserId, canManage, canWrite }: VisitNoteRowProps) {
  const [deleteState, deleteAction, deletePending] = useActionState(deleteNoteAction, initialState);
  const [, pinAction, pinPending] = useActionState(toggleNotePinAction, initialState);
  const canDelete = canManage || note.authorUserId === currentUserId;

  return (
    <li
      className={`flex flex-col gap-2 rounded-[var(--radius-sm)] border p-4 ${
        note.pinned
          ? "border-[var(--color-gold)]/50 bg-[var(--color-gold)]/8"
          : "border-[var(--color-ink)]/10"
      }`}
      data-testid="visit-note"
      data-note-id={note.id}
    >
      {note.pinned && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--color-gold)]/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#7c6a2f]">
          <PinIcon /> Pinned
        </span>
      )}
      <p className="whitespace-pre-wrap text-sm text-[var(--color-ink)]">{note.body}</p>
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-ink)]/60">
        <span>
          {note.authorName ?? "Unknown staff"} &middot; {formatNoteDate(note.createdAt)}
        </span>
        <div className="flex items-center gap-2">
          {canWrite && (
            <form action={pinAction}>
              <input type="hidden" name="noteId" value={note.id} />
              <input type="hidden" name="clientProfileId" value={clientProfileId} />
              <input type="hidden" name="pinned" value={note.pinned ? "false" : "true"} />
              <button
                type="submit"
                disabled={pinPending}
                className="lunia-btn lunia-btn-ghost lunia-btn-sm disabled:opacity-60"
              >
                <PinIcon /> {note.pinned ? "Unpin" : "Pin"}
              </button>
            </form>
          )}
          {canDelete && (
            <form
              action={deleteAction}
              onSubmit={(event) => {
                if (!confirm("Delete this comment? This cannot be undone.")) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="noteId" value={note.id} />
              <input type="hidden" name="clientProfileId" value={clientProfileId} />
              <button
                type="submit"
                disabled={deletePending}
                className="lunia-btn lunia-btn-danger lunia-btn-sm disabled:opacity-60"
              >
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </form>
          )}
        </div>
      </div>
      {deleteState.error && (
        <p role="alert" className="text-xs text-red-600">
          {deleteState.error}
        </p>
      )}
    </li>
  );
}

function PinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 3l5 5-2 2-1-1-4 4v5l-2 2-3-3-4 4-1-1 4-4-3-3 2-2h5l4-4-1-1 2-2z" />
    </svg>
  );
}
