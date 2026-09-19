"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { NotificationFeed, NotificationType } from "@/modules/notifications/feed";
import { sendDigestsAction } from "./notifications.actions";

const TYPE_ICON: Record<NotificationType, string> = {
  inquiry: "✉",
  whatsapp: "💬",
  lead: "✨",
  booking: "📅",
};

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
                      <span aria-hidden="true" className="text-base leading-none">{TYPE_ICON[item.type]}</span>
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
