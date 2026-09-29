"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "../../../_components/Modal";
import { addCallbackAction, openWhatsappAction, requestReviewAction, type ClientActionState } from "../actions";
import { SELECT_TAB_EVENT } from "./ProfileTabs";
import { Icon } from "./icons";

interface QuickActionsProps {
  clientProfileId: string;
  bookHref: string;
  checkoutHref: string | null;
  hasPhone: boolean;
  canManage: boolean;
  canWriteNotes: boolean;
  /** Completed visits without a review request yet. */
  reviewableVisits: number;
}

const initial: ClientActionState = {};
const btn = "lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-11 disabled:cursor-not-allowed disabled:opacity-60";
const label = "text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55";

// One row of the things staff do most from a profile. Each is either a
// prefilled deep link or a small server action; nothing here duplicates a
// module's own form.
export function QuickActions({ clientProfileId, bookHref, checkoutHref, hasPhone, canManage, canWriteNotes, reviewableVisits }: QuickActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<"whatsapp" | "review" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [cbState, cbAction, cbPending] = useActionState(async (prev: ClientActionState | null, fd: FormData) => {
    const result = await addCallbackAction(prev, fd);
    if (result.success) {
      setCallbackOpen(false);
      setNotice({ tone: "ok", text: "Call-back queued and assigned to you." });
      router.refresh();
    }
    return result;
  }, initial);

  function sendMessage() {
    setNotice(null);
    setPending("whatsapp");
    startTransition(async () => {
      const result = await openWhatsappAction(clientProfileId);
      setPending(null);
      if (result.ok) router.push(result.href);
      else setNotice({ tone: "error", text: result.error });
    });
  }

  function requestReview() {
    if (!confirm("Send this customer a review request for their latest visit?")) return;
    setNotice(null);
    setPending("review");
    startTransition(async () => {
      const result = await requestReviewAction(clientProfileId);
      setPending(null);
      if (result.success) {
        setNotice({ tone: "ok", text: "Review request scheduled." });
        router.refresh();
      } else setNotice({ tone: "error", text: result.error ?? "Failed." });
    });
  }

  function addNote() {
    window.dispatchEvent(new CustomEvent(SELECT_TAB_EVENT, { detail: "notes" }));
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-testid="visit-note-form"] textarea')?.focus());
  }

  return (
    <div className="flex flex-col gap-2" data-testid="quick-actions">
      <div className="flex flex-wrap gap-2">
        <Link href={bookHref} className="lunia-btn lunia-btn-forest lunia-btn-sm min-h-11">
          <Icon name="calendar" /> Book
        </Link>
        {checkoutHref && (
          <Link href={checkoutHref} className={btn}>
            <Icon name="receipt" /> Checkout
          </Link>
        )}
        {canManage && (
          <button type="button" onClick={sendMessage} disabled={isPending || !hasPhone} title={hasPhone ? undefined : "No phone number on file"} className={btn}>
            <Icon name="whatsapp" /> {pending === "whatsapp" ? "Opening…" : "Send message"}
          </button>
        )}
        {canWriteNotes && (
          <button type="button" onClick={addNote} className={btn}>
            <Icon name="note" /> Add note
          </button>
        )}
        {canManage && (
          <button type="button" onClick={() => setCallbackOpen(true)} disabled={!hasPhone} title={hasPhone ? undefined : "No phone number on file"} className={btn}>
            <Icon name="callback" /> Add call-back
          </button>
        )}
        {canManage && (
          <button type="button" onClick={requestReview} disabled={isPending || reviewableVisits === 0} title={reviewableVisits === 0 ? "No completed visit without a review request" : undefined} className={btn}>
            <Icon name="star" /> {pending === "review" ? "Sending…" : "Request review"}
          </button>
        )}
      </div>
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} aria-live="polite" className={`text-xs font-medium ${notice.tone === "error" ? "text-red-700" : "text-[var(--color-teal-ink)]"}`}>
          {notice.text}
        </p>
      )}

      {callbackOpen && (
        <Modal title="Add a call-back" onClose={() => setCallbackOpen(false)}>
          <form action={cbAction} className="flex flex-col gap-4">
            <input type="hidden" name="clientProfileId" value={clientProfileId} />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className={label}>Best time</span>
              <select name="preferredWindow" defaultValue="asap" className="lunia-input">
                <option value="asap">As soon as possible</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className={label}>Topic</span>
              <input name="topic" maxLength={200} className="lunia-input" autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className={label}>Notes</span>
              <textarea name="notes" rows={3} maxLength={2000} className="lunia-input" />
            </label>
            {cbState.error && (
              <p role="alert" className="text-sm text-red-700">
                {cbState.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCallbackOpen(false)} className="lunia-btn lunia-btn-ghost min-h-11">
                Cancel
              </button>
              <button type="submit" disabled={cbPending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
                {cbPending ? "Saving…" : "Queue call-back"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
