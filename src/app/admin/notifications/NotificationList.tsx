"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NotificationItem, NotificationType } from "@/modules/notifications/types";
import { NOTIFICATION_TYPE_LABELS } from "@/modules/notifications/types";
import { TypeIcon, timeAgo } from "../_components/NotificationBell";
import { readSeen, writeSeen, pruneSeen } from "../_components/notificationSeen";
import { EmptyState } from "../_components/EmptyState";

interface Props {
  items: NotificationItem[];
  showSeen: boolean;
}

// Full notification list with client-side seen state (see notificationSeen.ts).
export function NotificationList({ items, showSeen }: Props) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Hydrate from localStorage after mount (SSR has no storage).
    const live = pruneSeen(readSeen(), items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage hydration
    setSeen(live);
    setHydrated(true);
  }, [items]);

  function toggle(id: string) {
    setSeen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeSeen(next);
      return next;
    });
  }

  const visible = showSeen || !hydrated ? items : items.filter((i) => !seen.has(i.id));

  if (visible.length === 0) {
    return (
      <div className="lunia-card">
        <EmptyState
          title={items.length === 0 ? "Nothing needs your attention" : "Everything here is marked as seen"}
          body={items.length === 0 ? "New inquiries, due call-backs, unpaid invoices and stock alerts will show up here." : "Switch on “Show seen” to review them again."}
          action={items.length === 0 ? { href: "/admin", label: "Back to dashboard" } : undefined}
          icon={<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />}
        />
      </div>
    );
  }

  return (
    <ul className="lunia-card divide-y divide-[var(--line)] overflow-hidden">
      {visible.map((item) => {
        const isSeen = seen.has(item.id);
        return (
          <li key={item.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-ink)]/[0.02] sm:px-5">
            <TypeIcon type={item.type} muted={isSeen} />
            <Link href={item.href} onClick={() => !isSeen && toggle(item.id)} className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:shadow-[var(--ring)]">
              <span className={`block text-sm ${isSeen ? "text-[var(--color-ink)]/60" : "font-medium text-[var(--color-ink)]"}`}>{item.title}</span>
              {item.subtitle && <span className="block text-xs text-[var(--color-ink)]/55">{item.subtitle}</span>}
              <span className="mt-0.5 block text-[0.65rem] text-[var(--color-ink)]/40">
                {NOTIFICATION_TYPE_LABELS[item.type as NotificationType]} · {timeAgo(item.at)}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="lunia-btn lunia-btn-ghost lunia-btn-sm shrink-0"
              aria-pressed={isSeen}
            >
              {isSeen ? "Unsee" : "Mark seen"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
