"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assignInquiryAction, linkCustomerAction, replyInquiryAction, type InquiryActionState } from "./actions";
import { InlineStatus } from "../_ui/Form";

interface StaffOption {
  id: string;
  name: string;
}
interface InquiryPanelProps {
  id: string;
  email: string | null;
  assignedToId: string | null;
  clientProfileId: string | null;
  repliedAtIso: string | null;
  replyBody: string | null;
  staff: StaffOption[];
}

const initial: InquiryActionState = {};

export function InquiryPanel({ id, email, assignedToId, clientProfileId, repliedAtIso, replyBody, staff }: InquiryPanelProps) {
  const router = useRouter();
  const [assignState, assignAction, assignPending] = useActionState(assignInquiryAction, initial);
  const [linkState, linkAction, linkPending] = useActionState(linkCustomerAction, initial);
  const [replyState, replyAction, replyPending] = useActionState(replyInquiryAction, initial);

  return (
    <div className="flex flex-col gap-6">
      {/* Assign + link */}
      <div className="grid gap-4 sm:grid-cols-2">
        <form action={assignAction} className="flex flex-col gap-2 lunia-card p-4">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Assigned to</span>
          <input type="hidden" name="id" value={id} />
          <div className="flex items-center gap-2">
            <select name="assignedToId" defaultValue={assignedToId ?? ""} className="lunia-input">
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button type="submit" disabled={assignPending} className="lunia-btn lunia-btn-forest lunia-btn-sm disabled:opacity-60">
              {assignPending ? "Saving…" : "Save"}
            </button>
          </div>
          <InlineStatus size="sm" success={assignState.success ? "Saved." : undefined} />
          <InlineStatus size="sm" error={assignState.error} />
        </form>

        <div className="flex flex-col gap-2 lunia-card p-4">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Customer</span>
          {clientProfileId ? (
            <Link href={`/admin/clients/${clientProfileId}`} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm w-fit">
              View customer profile
            </Link>
          ) : (
            <form action={linkAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" disabled={linkPending} className="lunia-btn lunia-btn-forest lunia-btn-sm disabled:opacity-60">
                {linkPending ? "Linking…" : "Link to a customer"}
              </button>
              <InlineStatus size="sm" error={linkState.error} className="ms-2" />
            </form>
          )}
        </div>
      </div>

      {/* Reply by email */}
      <div className="flex flex-col gap-3 lunia-card p-5">
        <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Reply by email</span>
        {repliedAtIso && (
          <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)]/50 px-3 py-2 text-sm">
            <p className="text-xs text-[var(--color-ink)]/45">Replied {new Date(repliedAtIso).toLocaleString()}</p>
            {replyBody && <p className="mt-1 whitespace-pre-wrap text-[var(--color-ink)]/80">{replyBody}</p>}
          </div>
        )}
        {email ? (
          <form
            action={async (fd) => {
              await replyAction(fd);
              router.refresh();
            }}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="id" value={id} />
            <textarea name="body" rows={4} required placeholder={`Write a reply to ${email}…`} className="lunia-input" />
            <div className="flex items-center gap-3">
              <button type="submit" disabled={replyPending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
                {replyPending ? "Sending…" : "Send email reply"}
              </button>
              <InlineStatus size="sm" success={replyState.success ? "Sent." : undefined} />
              <InlineStatus size="sm" error={replyState.error} />
            </div>
          </form>
        ) : (
          <p className="text-sm text-[var(--color-ink)]/55">No email on file — reach this person by phone or WhatsApp.</p>
        )}
      </div>
    </div>
  );
}
