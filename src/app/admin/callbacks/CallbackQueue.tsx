"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignToMeAction, logOutcomeAction } from "./actions";
import { StatusPill } from "../assistant/_ui";

export interface CallbackCardDTO {
  id: string;
  name: string;
  phone: string;
  phoneDisplay: string;
  locale: string;
  preferredWindow: string | null;
  topic: string | null;
  notes: string | null;
  source: string;
  status: string;
  attempts: number;
  outcome: string | null;
  dueAtIso: string | null;
  overdue: boolean;
  createdAtIso: string;
  handledAtIso: string | null;
  clientProfileId: string | null;
  chatSessionId: string | null;
  assignedToName: string | null;
  assignedToMe: boolean;
  handledByName: string | null;
}

const OUTCOMES = [
  { value: "REACHED", label: "Reached" },
  { value: "BOOKED", label: "Booked" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
  { value: "NOT_INTERESTED", label: "Not interested" },
] as const;
type OutcomeValue = (typeof OUTCOMES)[number]["value"];

const WINDOW_LABELS: Record<string, string> = { asap: "As soon as possible", morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(iso));
}

function Card({ card, canManage }: { card: CallbackCardDTO; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<OutcomeValue | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isOpen = card.status === "OPEN" || card.status === "NO_ANSWER";

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else {
        setChoice(null);
        setNote("");
        router.refresh();
      }
    });

  const bookHref = `/admin/calendar?${new URLSearchParams({ name: card.name, phone: card.phone })}`;

  return (
    <li className={`lunia-card flex flex-col gap-3 p-4 ${card.overdue ? "border-[var(--color-gold)] ring-1 ring-[var(--color-gold)]/50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-[var(--color-ink)]">{card.name}</p>
          <p className="text-sm text-[var(--color-ink)]/65" dir="ltr">
            {card.phoneDisplay}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {card.overdue && <span className="text-xs font-semibold uppercase tracking-wide text-[#8a6d1f]">Due now</span>}
          <StatusPill value={card.status} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[0.68rem] uppercase tracking-wide text-[var(--color-ink)]/50">Call</dt>
          <dd>{formatDateTime(card.dueAtIso)}</dd>
        </div>
        <div>
          <dt className="text-[0.68rem] uppercase tracking-wide text-[var(--color-ink)]/50">Prefers</dt>
          <dd>{card.preferredWindow ? WINDOW_LABELS[card.preferredWindow] ?? card.preferredWindow : "Any time"}</dd>
        </div>
        <div>
          <dt className="text-[0.68rem] uppercase tracking-wide text-[var(--color-ink)]/50">Attempts</dt>
          <dd>
            {card.attempts}
            {card.outcome ? ` · ${card.outcome.replace(/_/g, " ").toLowerCase()}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[0.68rem] uppercase tracking-wide text-[var(--color-ink)]/50">Owner</dt>
          <dd>{card.assignedToName ?? "Unassigned"}</dd>
        </div>
      </dl>

      {(card.topic || card.notes) && (
        <p className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--color-ink)]/80">
          {card.topic && <span className="font-medium">{card.topic.replace(/_/g, " ")}</span>}
          {card.topic && card.notes ? " — " : ""}
          {card.notes}
        </p>
      )}
      <p className="text-xs text-[var(--color-ink)]/50">
        {card.source === "CHAT" ? "Website assistant" : card.source.toLowerCase()} · requested {formatDateTime(card.createdAtIso)} · {card.locale.toUpperCase()}
        {card.handledByName && ` · last handled by ${card.handledByName} ${formatDateTime(card.handledAtIso)}`}
      </p>

      <div className="flex flex-wrap gap-2">
        <a href={`tel:${card.phone}`} className="lunia-btn lunia-btn-forest min-h-11">
          Call {card.phoneDisplay}
        </a>
        {card.clientProfileId && (
          <Link href={`/admin/clients/${card.clientProfileId}`} className="lunia-btn lunia-btn-ghost min-h-11">
            Customer
          </Link>
        )}
        {card.chatSessionId && (
          <Link href={`/admin/assistant/${card.chatSessionId}`} className="lunia-btn lunia-btn-ghost min-h-11">
            Chat
          </Link>
        )}
        {canManage && (
          <Link href={bookHref} className="lunia-btn lunia-btn-ghost min-h-11">
            Book for this customer
          </Link>
        )}
        {canManage && isOpen && !card.assignedToMe && (
          <button type="button" disabled={pending} onClick={() => run(() => assignToMeAction(card.id))} className="lunia-btn lunia-btn-ghost min-h-11 disabled:opacity-60">
            Assign to me
          </button>
        )}
      </div>

      {canManage && isOpen && (
        <div className="border-t border-[var(--line)] pt-3">
          <p className="mb-2 text-[0.68rem] font-medium uppercase tracking-wide text-[var(--color-ink)]/55">Log this call</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Call outcome">
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={choice === o.value}
                onClick={() => setChoice(choice === o.value ? null : o.value)}
                className={`min-h-11 rounded-full px-4 text-sm transition-colors ${
                  choice === o.value
                    ? "bg-[var(--color-teal)] text-[var(--color-ink)]"
                    : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/75 hover:bg-[var(--color-ink)]/5"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {choice && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={2}
                placeholder="Note (optional)"
                aria-label="Call note"
                className="lunia-input min-h-11 flex-1"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => logOutcomeAction({ id: card.id, outcome: choice, note }))}
                className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60"
              >
                {pending ? "Saving…" : choice === "NO_ANSWER" ? "Save and reschedule" : "Save"}
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}

export function CallbackQueue({ cards, canManage }: { cards: CallbackCardDTO[]; canManage: boolean }) {
  if (cards.length === 0) {
    return (
      <p className="rounded border border-dashed border-[var(--color-ink)]/20 px-4 py-8 text-center text-sm text-[var(--color-ink)]/60">
        Nothing in the queue.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {cards.map((card) => (
        <Card key={card.id} card={card} canManage={canManage} />
      ))}
    </ul>
  );
}
