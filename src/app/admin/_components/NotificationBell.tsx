"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_HREF, type NotificationFeed, type NotificationType } from "@/modules/notifications/types";
import { sendDigestsAction } from "./notifications.actions";
import { readSeen, writeSeen, pruneSeen } from "./notificationSeen";

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

export function TypeIcon({ type, muted = false }: { type: NotificationType; muted?: boolean }) {
  return (
    <span aria-hidden="true" className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${muted ? "bg-[var(--color-ink)]/[0.05] text-[var(--color-ink)]/40" : "bg-[var(--color-teal)]/25 text-[var(--color-forest)]"}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d={TYPE_ICON[type]} />
      </svg>
    </span>
  );
}

export function timeAgo(at: Date): string {
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Admin notification center: a bell with an open-item badge and a dropdown
// grouped by type. The feed is derived server-side (items clear as they're
// handled); "seen" is client-side and just quiets an item. "View all" opens
// /admin/notifications with filters.
export function NotificationBell({ feed }: { feed: NotificationFeed }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [digestMsg, setDigestMsg] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function sendDigests() {
    setDigestMsg(null);
    startSend(async () => {
      const result = await sendDigestsAction();
      setDigestMsg(result.ok ? result.message : result.error);
    });
  }

  function openPanel() {
    // Hydrate seen-state on open (localStorage is client-only).
    const live = pruneSeen(readSeen(), feed.items.map((i) => i.id));
    writeSeen(live);
    setSeen(live);
    setOpen(true);
  }

  function markSeen(id: string) {
    setSeen((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeSeen(next);
      return next;
    });
  }

  function markAllSeen() {
    const next = new Set(feed.items.map((i) => i.id));
    writeSeen(next);
    setSeen(next);
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Group the newest items by type, ordered by the type's open count.
  const groups = (Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[])
    .map((type) => ({ type, count: feed.counts[type] ?? 0, items: feed.items.filter((i) => i.type === type) }))
    .filter((g) => g.count > 0 || g.items.length > 0)
    .sort((a, b) => b.count - a.count);
  const unseen = feed.items.filter((i) => !seen.has(i.id)).length;

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={`Notifications${feed.total ? ` (${feed.total} open)` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-10 w-10 items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] text-[var(--color-ink)]/70 shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-ink)]/[0.04] focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
        data-testid="notification-bell"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {feed.total > 0 && (
          <span className="lunia-tabular absolute -end-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--color-forest)] px-1 text-[0.65rem] font-semibold text-[var(--color-cream)]">
            {feed.total > 99 ? "99+" : feed.total}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="lunia-pop-in absolute end-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--color-ink)]">Notifications</span>
            <span className="text-xs text-[var(--color-ink)]/50">
              {feed.total} open{unseen > 0 && unseen !== feed.total ? ` · ${unseen} new` : ""}
            </span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
            {groups.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--color-ink)]/55">You&rsquo;re all caught up.</p>
            ) : (
              groups.map((group) => (
                <section key={group.type} aria-label={NOTIFICATION_TYPE_LABELS[group.type]} className="border-b border-[var(--line)] last:border-b-0">
                  <div className="flex items-center justify-between px-4 pb-1 pt-2.5">
                    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/50">{NOTIFICATION_TYPE_LABELS[group.type]}</span>
                    <Link
                      href={NOTIFICATION_TYPE_HREF[group.type]}
                      onClick={() => setOpen(false)}
                      className="lunia-tabular rounded-full bg-[var(--color-ink)]/[0.06] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--color-ink)]/70 hover:bg-[var(--color-teal)]/30"
                    >
                      {group.count}
                    </Link>
                  </div>
                  <ul>
                    {group.items.slice(0, 4).map((item) => {
                      const isSeen = seen.has(item.id);
                      return (
                        <li key={item.id} className="group/item flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-ink)]/[0.03]">
                          <TypeIcon type={item.type} muted={isSeen} />
                          <Link href={item.href} onClick={() => { markSeen(item.id); setOpen(false); }} className="min-w-0 flex-1 focus-visible:outline-none focus-visible:shadow-[var(--ring)] rounded">
                            <span className={`block truncate text-sm ${isSeen ? "text-[var(--color-ink)]/60" : "font-medium text-[var(--color-ink)]"}`}>{item.title}</span>
                            {item.subtitle && <span className="block truncate text-xs text-[var(--color-ink)]/55">{item.subtitle}</span>}
                            <span className="mt-0.5 block text-[0.65rem] text-[var(--color-ink)]/40">{timeAgo(item.at)}</span>
                          </Link>
                          {!isSeen && (
                            <button
                              type="button"
                              onClick={() => markSeen(item.id)}
                              aria-label={`Mark "${item.title}" as seen`}
                              title="Mark as seen"
                              className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink)]/40 opacity-0 transition-opacity hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)] focus-visible:opacity-100 group-hover/item:opacity-100"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-2.5">
            <Link href="/admin/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-[var(--color-teal-ink)] hover:underline">
              View all
            </Link>
            {feed.items.length > 0 && unseen > 0 && (
              <button type="button" onClick={markAllSeen} className="text-xs text-[var(--color-ink)]/55 hover:text-[var(--color-ink)] hover:underline">
                Mark all as seen
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1 border-t border-[var(--line)] px-4 py-2">
            <button
              type="button"
              onClick={sendDigests}
              disabled={sending}
              aria-busy={sending}
              className="text-start text-xs text-[var(--color-ink)]/55 hover:text-[var(--color-forest)] hover:underline disabled:opacity-60"
            >
              {sending ? "Sending digests…" : "Email digests to assignees"}
            </button>
            {digestMsg && <span role="status" className="text-xs text-[var(--color-ink)]/55">{digestMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
