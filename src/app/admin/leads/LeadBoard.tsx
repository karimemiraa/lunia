"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveLeadStageAction, quickLogCallAction } from "./actions";
import type { PipelineCard } from "@/modules/crm/leads";

interface StageOpt {
  key: string;
  label: string;
  color: string;
}

interface LeadBoardProps {
  stages: StageOpt[];
  columns: Record<string, PipelineCard[]>;
  counts: Record<string, number>;
  canManage: boolean;
  /** Center-local "now" from the server so age/overdue are stable across hydration. */
  nowIso: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", day: "numeric", month: "short" });

function ageLabel(createdAt: Date, now: Date): string {
  const days = Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function sourceKind(source: string | null): "chat" | "whatsapp" | "web" | "other" {
  const s = (source ?? "").toLowerCase();
  if (s.includes("whatsapp")) return "whatsapp";
  if (s.includes("chat") || s.includes("assistant")) return "chat";
  if (s.includes("web") || s.includes("site") || s.includes("google") || s.includes("instagram") || s.includes("ads")) return "web";
  return "other";
}

function SourceIcon({ kind }: { kind: ReturnType<typeof sourceKind> }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "h-3.5 w-3.5", "aria-hidden": true };
  if (kind === "whatsapp")
    return (
      <svg {...common}>
        <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.1z" />
        <path d="M9.5 9.5c0 3 2 5 5 5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z" />
      </svg>
    );
  if (kind === "chat")
    return (
      <svg {...common}>
        <path d="M4 5h16v11H9l-5 4z" />
        <path d="M8 9h8M8 12h5" />
      </svg>
    );
  if (kind === "web")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 6h16l-6 7v5l-4 2v-7z" />
    </svg>
  );
}

const OUTCOMES: { key: string; label: string; followUpDays: number | null }[] = [
  { key: "REACHED", label: "Reached", followUpDays: null },
  { key: "INTERESTED", label: "Interested", followUpDays: 3 },
  { key: "NO_ANSWER", label: "No answer", followUpDays: 1 },
  { key: "NOT_INTERESTED", label: "Not interested", followUpDays: null },
  { key: "BOOKED", label: "Booked", followUpDays: null },
];

function Card({ card, stages, now, canManage, pending, onMove, onLog, onDragStart }: { card: PipelineCard; stages: StageOpt[]; now: Date; canManage: boolean; pending: boolean; onMove: (id: string, stage: string) => void; onLog: (id: string, outcome: string, note: string, days: number | null) => void; onDragStart: (id: string) => void }) {
  const [logOpen, setLogOpen] = useState(false);
  const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const idx = stages.findIndex((s) => s.key === card.stage);
  const prev = idx > 0 ? stages[idx - 1] : null;
  const next = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;
  const followUp = card.nextFollowUpAt ? new Date(card.nextFollowUpAt) : null;
  const overdue = !!followUp && followUp.getTime() <= now.getTime();
  const dueToday = !!followUp && !overdue && followUp.getTime() - now.getTime() < DAY_MS;
  const kind = sourceKind(card.source);

  useEffect(() => {
    if (!logOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setLogOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [logOpen]);

  return (
    <div
      ref={ref}
      draggable={canManage}
      onDragStart={() => onDragStart(card.id)}
      className={`flex flex-col gap-2 rounded-[var(--radius)] border bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)] ${canManage ? "cursor-grab active:cursor-grabbing" : ""} ${overdue ? "border-[var(--color-gold)] ring-1 ring-[var(--color-gold)]/50" : "border-[var(--line)]"}`}
      data-testid="lead-card"
      data-overdue={overdue ? "true" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/admin/clients/${card.id}`} className="min-w-0 truncate text-sm font-medium text-[var(--color-ink)] hover:underline">
          {card.name || "Unnamed"}
        </Link>
        <span className="shrink-0 text-[0.65rem] text-[var(--color-ink)]/45" title={`Added ${dateFmt.format(new Date(card.createdAt))}`}>
          {ageLabel(new Date(card.createdAt), now)}
        </span>
      </div>
      {(card.phone || card.email) && <p className="truncate text-xs text-[var(--color-ink)]/55">{card.phone ?? card.email}</p>}
      <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem]">
        {card.source && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-cream)]/70 px-2 py-0.5 text-[var(--color-ink)]/65" title={`Source: ${card.source}`}>
            <SourceIcon kind={kind} />
            {card.source}
          </span>
        )}
        {card.direction && <span className="rounded-full bg-[var(--color-ink)]/[0.06] px-2 py-0.5 uppercase tracking-wide text-[var(--color-ink)]/55">{card.direction === "INBOUND" ? "In" : "Out"}</span>}
        {card.ownerName && <span className="rounded-full bg-[var(--color-teal)]/15 px-2 py-0.5 text-[var(--color-teal-ink)]">{card.ownerName}</span>}
        {followUp && (
          <span className={`rounded-full px-2 py-0.5 font-medium ${overdue ? "bg-[var(--color-gold)]/30 text-[#7c6a2f]" : dueToday ? "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]" : "bg-[var(--color-ink)]/[0.06] text-[var(--color-ink)]/60"}`}>
            {overdue ? "Overdue" : dueToday ? "Due today" : "Follow up"} {dateFmt.format(followUp)}
          </span>
        )}
      </div>

      {canManage && (
        <div className="relative mt-1 flex items-center gap-1">
          <button type="button" disabled={pending || !prev} onClick={() => prev && onMove(card.id, prev.key)} aria-label={prev ? `Move ${card.name} to ${prev.label}` : "First stage"} title={prev ? `Move to ${prev.label}` : undefined} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--color-ink)]/70 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] disabled:opacity-35">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 rtl:rotate-180" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m15 6-6 6 6 6" /></svg>
          </button>
          <button type="button" disabled={pending || !next} onClick={() => next && onMove(card.id, next.key)} aria-label={next ? `Move ${card.name} to ${next.label}` : "Last stage"} title={next ? `Move to ${next.label}` : undefined} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--color-ink)]/70 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] disabled:opacity-35">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 rtl:rotate-180" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" /></svg>
          </button>
          <label className="sr-only" htmlFor={`stage-${card.id}`}>
            Move {card.name} to another stage
          </label>
          <select id={`stage-${card.id}`} value={card.stage} disabled={pending} onChange={(e) => onMove(card.id, e.target.value)} className="lunia-input min-h-9 flex-1 py-1 text-xs" data-testid="lead-move-select">
            {stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setLogOpen((o) => !o)} aria-expanded={logOpen} disabled={pending} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-9 px-2.5" title="Log a call">
            Log call
          </button>
          {logOpen && (
            <div className="absolute end-0 top-full z-20 mt-1 flex w-64 flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-md)]" data-testid="quick-log">
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Call outcome</p>
              <div className="flex flex-wrap gap-1">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => {
                      onLog(card.id, o.key, note, o.followUpDays);
                      setLogOpen(false);
                      setNote("");
                    }}
                    className="min-h-9 rounded-full border border-[var(--line-strong)] px-2.5 text-xs text-[var(--color-ink)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]"
                    title={o.followUpDays !== null ? `Sets follow-up in ${o.followUpDays} day${o.followUpDays === 1 ? "" : "s"}` : undefined}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-[var(--color-ink)]/55">Note (optional)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="lunia-input min-h-9 py-1 text-xs" />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A drag-and-drop pipeline board. Cards can be dragged between stage columns
// (desktop), moved with the arrow buttons / select (keyboard, mobile), and a
// call can be logged from the card without leaving the board.
export function LeadBoard({ stages, columns, counts, canManage, nowIso }: LeadBoardProps) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function move(id: string, stage: string) {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await moveLeadStageAction(id, stage);
      if (result.ok) {
        setStatus(`Moved to ${stages.find((s) => s.key === stage)?.label ?? stage}.`);
        router.refresh();
      } else setError(result.error);
    });
  }

  function log(id: string, outcome: string, note: string, days: number | null) {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await quickLogCallAction(id, outcome, note, days);
      if (result.ok) {
        setStatus("Call logged.");
        router.refresh();
      } else setError(result.error);
    });
  }

  const overdueTotal = Object.values(columns).flat().filter((c) => c.nextFollowUpAt && new Date(c.nextFollowUpAt).getTime() <= now.getTime()).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
        {overdueTotal > 0 && (
          <span className="rounded-full bg-[var(--color-gold)]/25 px-3 py-1 text-xs font-medium text-[#7c6a2f]" data-testid="overdue-count">
            {overdueTotal} follow-up{overdueTotal === 1 ? "" : "s"} overdue
          </span>
        )}
        {status && <span className="text-xs text-[var(--color-teal-ink)]">{status}</span>}
        {error && (
          <span role="alert" className="text-xs text-red-700">
            {error}
          </span>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {stages.map((s) => {
          const cards = columns[s.key] ?? [];
          const isOver = overStage === s.key;
          return (
            <div
              key={s.key}
              onDragOver={(e) => {
                if (!canManage) return;
                e.preventDefault();
                setOverStage(s.key);
              }}
              onDragLeave={() => setOverStage((cur) => (cur === s.key ? null : cur))}
              onDrop={() => {
                if (dragId) move(dragId, s.key);
                setDragId(null);
                setOverStage(null);
              }}
              className={`flex w-72 shrink-0 flex-col gap-2 rounded-[var(--radius-lg)] border p-3 transition-colors ${isOver ? "border-[var(--color-teal)] bg-[var(--color-teal)]/[0.06]" : "border-[var(--line)] bg-[var(--surface-2)]/40"}`}
              data-stage={s.key}
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color || "var(--color-ink)" }} />
                  {s.label}
                </span>
                <span className="rounded-full bg-[var(--color-ink)]/[0.06] px-2 py-0.5 text-xs text-[var(--color-ink)]/55">{counts[s.key] ?? 0}</span>
              </div>
              <div className="flex flex-col gap-2">
                {cards.length === 0 ? (
                  <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] px-3 py-6 text-center text-xs text-[var(--color-ink)]/40">{canManage ? "Drop here" : "No leads"}</p>
                ) : (
                  cards.map((card) => <Card key={card.id} card={card} stages={stages} now={now} canManage={canManage} pending={isPending} onMove={move} onLog={log} onDragStart={setDragId} />)
                )}
                {(counts[s.key] ?? 0) > cards.length && <p className="px-1 text-xs text-[var(--color-ink)]/45">+{(counts[s.key] ?? 0) - cards.length} more…</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
