"use client";

import { useActionState, useId, useRef } from "react";
import { addHubCommentAction, deleteHubCommentAction, toggleHubCommentPinAction, type HubActionState } from "./actions";
import type { HubComment } from "@/modules/booking/appointmentHub";
import { InlineStatus } from "../../_ui/Form";
import { ConfirmButton } from "../../_ui/ConfirmDialog";

interface HubCommentsProps {
  appointmentId: string;
  bookingId: string;
  clientProfileId: string;
  comments: HubComment[];
  currentUserId: string;
  canWrite: boolean;
  canManage: boolean;
}

const initialState: HubActionState = {};
const CENTER_TZ = "Asia/Riyadh";
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" });

// The visit's comment thread: an add form (VISITNOTE_WRITE) plus the list,
// pinned-first. Comments are shared with the Customer 360 (same VisitNote
// rows) but scoped here to this visit via its bookingId.
export function HubComments({ appointmentId, bookingId, clientProfileId, comments, currentUserId, canWrite, canManage }: HubCommentsProps) {
  const [addState, addAction, addPending] = useActionState(addHubCommentAction, initialState);
  const bodyId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <form
          ref={formRef}
          action={async (formData) => {
            await addAction(formData);
            formRef.current?.reset();
          }}
          data-testid="hub-comment-form"
          className="flex flex-col gap-3 lunia-card p-5"
        >
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="clientProfileId" value={clientProfileId} />
          <label htmlFor={bodyId} className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-[var(--color-ink)]">Add comment</span>
            <textarea
              id={bodyId}
              name="body"
              required
              rows={3}
              placeholder="What happened on this visit, follow-ups, front-desk notes…"
              className="w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={addPending} className="w-fit lunia-btn lunia-btn-primary disabled:opacity-60">
              {addPending ? "Saving…" : "Add comment"}
            </button>
            <InlineStatus success={addState.success ? "Comment added." : undefined} />
            <InlineStatus error={addState.error} />
          </div>
        </form>
      )}

      {comments.length === 0 ? (
        <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
          No comments on this visit yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="hub-comments-list">
          {comments.map((note) => (
            <CommentRow
              key={note.id}
              note={note}
              appointmentId={appointmentId}
              canDelete={canManage || note.authorUserId === currentUserId}
              canWrite={canWrite}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentRow({ note, appointmentId, canDelete, canWrite }: { note: HubComment; appointmentId: string; canDelete: boolean; canWrite: boolean }) {
  const [deleteState, deleteAction, deletePending] = useActionState(deleteHubCommentAction, initialState);
  const [, pinAction, pinPending] = useActionState(toggleHubCommentPinAction, initialState);

  return (
    <li
      className={`flex flex-col gap-2 rounded-[var(--radius-sm)] border p-4 ${note.pinned ? "border-[var(--color-gold)]/50 bg-[var(--color-gold)]/8" : "border-[var(--color-ink)]/10"}`}
      data-testid="hub-comment"
    >
      {note.pinned && <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--color-gold)]/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#7c6a2f]"><PinIcon /> Pinned</span>}
      <p className="whitespace-pre-wrap text-sm text-[var(--color-ink)]">{note.body}</p>
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-ink)]/60">
        <span>{note.authorName ?? "Unknown staff"} &middot; {fmt.format(note.createdAt)}</span>
        <div className="flex items-center gap-2">
          {canWrite && (
            <form action={pinAction}>
              <input type="hidden" name="appointmentId" value={appointmentId} />
              <input type="hidden" name="noteId" value={note.id} />
              <input type="hidden" name="pinned" value={note.pinned ? "false" : "true"} />
              <button type="submit" disabled={pinPending} className="lunia-btn lunia-btn-ghost lunia-btn-sm disabled:opacity-60">
                <PinIcon /> {note.pinned ? "Unpin" : "Pin"}
              </button>
            </form>
          )}
          {canDelete && (
            <form action={deleteAction}>
              <input type="hidden" name="appointmentId" value={appointmentId} />
              <input type="hidden" name="noteId" value={note.id} />
              <ConfirmButton title="Delete this comment?" description="This cannot be undone." confirmLabel="Delete" pending={deletePending} className="lunia-btn lunia-btn-danger lunia-btn-sm">
                {deletePending ? "Deleting…" : "Delete"}
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>
      <InlineStatus size="sm" error={deleteState.error} />
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
