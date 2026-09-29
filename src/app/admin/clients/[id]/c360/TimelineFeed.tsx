"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { pageTimeline, TIMELINE_KINDS, TIMELINE_KIND_LABELS, type TimelineEntry, type TimelineKind } from "@/modules/crm/timelineCore";
import { Icon } from "./icons";

/** Serialized entry (dates as ISO) for the client boundary. */
export interface TimelineEntryDTO extends Omit<TimelineEntry, "at"> {
  atIso: string;
}

const PAGE_SIZE = 25;
const CENTER_TZ = "Asia/Riyadh";
const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: CENTER_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

const KIND_TONE: Record<TimelineKind, string> = {
  booking: "bg-[var(--color-teal)]/25 text-[var(--color-teal-ink)]",
  invoice: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  payment: "bg-[var(--color-canopy)]/25 text-[var(--color-teal-ink)]",
  package: "bg-[var(--color-canopy)]/20 text-[var(--color-teal-ink)]",
  giftcard: "bg-[var(--color-gold)]/20 text-[#7c6a2f]",
  loyalty: "bg-[var(--color-teal)]/15 text-[var(--color-teal-ink)]",
  chat: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/70",
  callback: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  whatsapp: "bg-[#25D366]/15 text-[var(--color-ink)]/80",
  inquiry: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/70",
  note: "bg-[var(--color-gold)]/20 text-[#7c6a2f]",
  lead: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/70",
  consent: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]",
  treatment: "bg-[var(--color-canopy)]/25 text-[var(--color-teal-ink)]",
  photo: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/70",
  review: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  waitlist: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/70",
};

const STATUS_TONE: Record<string, string> = {
  COMPLETED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  CONFIRMED: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]",
  CHECKED_IN: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  REQUESTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-700",
  PAID: "bg-[var(--color-teal)]/25 text-[var(--color-teal-ink)]",
  ISSUED: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  PARTIALLY_PAID: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  VOID: "bg-red-100 text-red-700",
  OPEN: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  DONE: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  WAITING: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  NOTIFIED: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]",
  APPROVED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  BOOKED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
};

interface TimelineFeedProps {
  entries: TimelineEntryDTO[];
  /** Only kinds that exist for this customer are offered as filters. */
  canSeePhotos?: boolean;
}

// Newest-first activity feed with kind filter chips and "show more" paging
// (pageTimeline). Rows are grouped by center-local day so a busy visit reads
// as one block. Everything here is presentational; the merge happened on the
// server.
export function TimelineFeed({ entries, canSeePhotos = false }: TimelineFeedProps) {
  const all = useMemo<TimelineEntry[]>(() => entries.map((e) => ({ ...e, at: new Date(e.atIso) })), [entries]);
  const availableKinds = useMemo(() => TIMELINE_KINDS.filter((k) => all.some((e) => e.kind === k)), [all]);
  const [kinds, setKinds] = useState<TimelineKind[]>([]);
  const [page, setPage] = useState(1);

  const paged = useMemo(() => pageTimeline(all, { page: 1, pageSize: PAGE_SIZE * page, kinds }), [all, page, kinds]);

  function toggleKind(kind: TimelineKind) {
    setPage(1);
    setKinds((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]));
  }

  if (all.length === 0) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-10 text-center">
        <p className="text-sm text-[var(--color-ink)]/60">No activity yet. Book a first appointment to start their story.</p>
      </div>
    );
  }

  // Group the visible page by day.
  const groups: { day: string; label: string; rows: TimelineEntry[] }[] = [];
  for (const e of paged.entries) {
    const day = dayKeyFmt.format(e.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(e);
    else groups.push({ day, label: dayFmt.format(e.at), rows: [e] });
  }

  return (
    <div className="flex flex-col gap-5" data-testid="customer-timeline">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter timeline by type">
        <button
          type="button"
          onClick={() => {
            setKinds([]);
            setPage(1);
          }}
          aria-pressed={kinds.length === 0}
          className={`min-h-9 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${
            kinds.length === 0 ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "border border-[var(--line-strong)] text-[var(--color-ink)]/70 hover:bg-[var(--surface-2)]"
          }`}
        >
          All ({all.length})
        </button>
        {availableKinds.map((k) => {
          const on = kinds.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKind(k)}
              aria-pressed={on}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${
                on ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "border border-[var(--line-strong)] text-[var(--color-ink)]/70 hover:bg-[var(--surface-2)]"
              }`}
            >
              <Icon name={k} className="h-3.5 w-3.5" />
              {TIMELINE_KIND_LABELS[k]}
            </button>
          );
        })}
      </div>

      {paged.entries.length === 0 ? (
        <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
          Nothing of that type yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-6">
          {groups.map((g) => (
            <li key={g.day} className="flex flex-col gap-2">
              <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/45">{g.label}</h3>
              <ol className="flex flex-col gap-1.5 border-s border-[var(--line)] ps-4">
                {g.rows.map((e) => (
                  <li key={e.id} className="relative" data-testid="timeline-row" data-kind={e.kind}>
                    <span className={`absolute -start-[1.6rem] top-2 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-[var(--color-page)] ${KIND_TONE[e.kind]}`}>
                      <Icon name={e.kind} className="h-3.5 w-3.5" />
                    </span>
                    <Row entry={e} canSeePhotos={canSeePhotos} />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-ink)]/50">
        <span>
          Showing {paged.entries.length} of {paged.total}
        </span>
        {paged.hasMore && (
          <button type="button" onClick={() => setPage((p) => p + 1)} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9">
            Show more
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ entry, canSeePhotos }: { entry: TimelineEntry; canSeePhotos: boolean }) {
  const inner = (
    <>
      {entry.photoId && canSeePhotos && (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated route
        <img src={`/admin/clinical/photo/${entry.photoId}`} alt="" className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] bg-[var(--surface-2)] object-cover" loading="lazy" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-ink)]">{entry.title}</span>
          {entry.status && (
            <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${STATUS_TONE[entry.status] ?? "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/60"}`}>
              {entry.status.replace(/_/g, " ")}
            </span>
          )}
        </span>
        {entry.detail && <span className="truncate text-xs text-[var(--color-ink)]/60">{entry.detail}</span>}
      </span>
      <time dateTime={entry.at.toISOString()} className="shrink-0 text-xs tabular-nums text-[var(--color-ink)]/45">
        {dtFmt.format(entry.at)}
      </time>
    </>
  );
  const cls = "flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 transition-colors duration-150 ease-out";
  return entry.href ? (
    <Link href={entry.href} className={`${cls} hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
