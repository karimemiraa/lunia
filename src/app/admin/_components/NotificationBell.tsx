"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { NotificationFeed, NotificationType } from "@/modules/notifications/feed";
import { sendDigestsAction } from "./notifications.actions";

// Line icons (24px viewBox paths) per notification type -- no emoji.
const TYPE_ICON: Record<NotificationType, string> = {
  inquiry: "M4 6h16v12H4z M4 7l8 6 8-6",
  whatsapp: "M4 5h16v11H9l-5 4z M8 9.5h8 M8 12.5h5",
  lead: "M12 4v16 M4 12h16 M6.5 6.5l11 11 M17.5 6.5l-11 11",
  booking: "M3.5 5h17v16h-17z M3.5 9h17 M8 3v4 M16 3v4",
  callback: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z",
  stock: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z m-8 4.5 8 4.5 8-4.5 M12 12v9",
  leave: "M3.5 5h17v16h-17z M3.5 9h17 M9 14l2 2 4-4",
  document: "M6 3h8l4 4v14H6z M14 3v4h4 M12 11v4 M12 17.5v.5",
  invoice: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3",
};

function TypeIcon({ type }: { type: NotificationType }) {
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-teal)]/25 text-[var(--color-forest)]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d={TYPE_ICON[type]} />
      </svg>
    </span>
  );
}

function timeAgo(at: Date): string {
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Admin notification center: a bell with an unread-count badge and a dropdown
// of the newest actionable items. The feed is derived server-side and passed
// in; items link straight to the record and clear as they're handled.
export function NotificationBell({ feed }: { feed: NotificationFeed }) {
  const [open, setOpen] = useState(false);
  const [digestMsg, setDigestMsg] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  function sendDigests() {
    setDigestMsg(null);
    startSend(async () => {
      const result = await sendDigestsAction();
      setDigestMsg(result.ok ? result.message : result.error);
    });
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${feed.total ? ` (${feed.total} new)` : ""}`}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] text-[var(--color-ink)]/70 transition-colors hover:bg-[var(--color-ink)]/[0.04]"
        data-testid="notification-bell"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {feed.total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--color-forest)] px-1 text-[0.65rem] font-semibold text-[var(--color-cream)]">
            {feed.total > 9 ? "9+" : feed.total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-30 mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--color-ink)]">Notifications</span>
            <span className="text-xs text-[var(--color-ink)]/50">{feed.total} new</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {feed.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--color-ink)]/50">You&rsquo;re all caught up.</p>
            ) : (
              <ul className="flex flex-col">
                {feed.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 border-b border-[var(--line)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[var(--color-ink)]/[0.03]"
                    >
                      <TypeIcon type={item.type} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--color-ink)]">{item.title}</span>
                        {item.subtitle && <span className="block truncate text-xs text-[var(--color-ink)]/55">{item.subtitle}</span>}
                        <span className="mt-0.5 block text-[0.65rem] text-[var(--color-ink)]/40">{timeAgo(item.at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1 border-t border-[var(--line)] px-4 py-2.5">
            <button
              type="button"
              onClick={sendDigests}
              disabled={sending}
              className="text-start text-xs font-medium text-[var(--color-forest)] hover:underline disabled:opacity-60"
            >
              {sending ? "Sending digests…" : "Email digests to assignees"}
            </button>
            {digestMsg && <span className="text-xs text-[var(--color-ink)]/55">{digestMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
