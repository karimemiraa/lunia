"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveLeadStageAction } from "./actions";
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
}

function Card({
  card,
  stages,
  onMove,
  onDragStart,
  pending,
}: {
  card: PipelineCard;
  stages: StageOpt[];
  onMove: (id: string, stage: string) => void;
  onDragStart: (id: string) => void;
  pending: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(card.id)}
      className="flex cursor-grab flex-col gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)] active:cursor-grabbing"
      data-testid="lead-card"
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/admin/clients/${card.id}`} className="min-w-0 truncate text-sm font-medium text-[var(--color-ink)] hover:underline">
          {card.name || "Unnamed"}
        </Link>
        {card.direction && (
          <span className="shrink-0 rounded-full bg-[var(--color-ink)]/[0.06] px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-[var(--color-ink)]/55">
            {card.direction === "INBOUND" ? "In" : "Out"}
          </span>
        )}
      </div>
      {(card.phone || card.email) && (
        <p className="truncate text-xs text-[var(--color-ink)]/55">{card.phone ?? card.email}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem]">
        {card.source && <span className="rounded-full bg-[var(--color-cream)]/70 px-2 py-0.5 text-[var(--color-ink)]/60">{card.source}</span>}
        {card.ownerName && <span className="rounded-full bg-[var(--color-forest)]/10 px-2 py-0.5 text-[var(--color-forest)]">{card.ownerName}</span>}
      </div>
      {/* Mobile / accessible move control (drag is the desktop path). */}
      <select
        value={card.stage}
        disabled={pending}
        onChange={(e) => onMove(card.id, e.target.value)}
        aria-label={`Move ${card.name} to another stage`}
        className="lunia-input mt-1 py-1.5 text-xs"
        data-testid="lead-move-select"
      >
        {stages.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}

// A drag-and-drop pipeline board. Cards can be dragged between stage columns
// (desktop) or moved with the per-card select (mobile/keyboard). Both call
// moveLeadStageAction and refresh.
export function LeadBoard({ stages, columns, counts }: LeadBoardProps) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function move(id: string, stage: string) {
    setError(null);
    startTransition(async () => {
      const result = await moveLeadStageAction(id, stage);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {stages.map((s) => {
          const cards = columns[s.key] ?? [];
          const isOver = overStage === s.key;
          return (
            <div
              key={s.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(s.key);
              }}
              onDragLeave={() => setOverStage((cur) => (cur === s.key ? null : cur))}
              onDrop={() => {
                if (dragId) move(dragId, s.key);
                setDragId(null);
                setOverStage(null);
              }}
              className={`flex w-72 shrink-0 flex-col gap-2 rounded-[var(--radius-lg)] border p-3 transition-colors ${
                isOver ? "border-[var(--color-teal)] bg-[var(--color-teal)]/[0.06]" : "border-[var(--line)] bg-[var(--surface-2)]/40"
              }`}
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
                  <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] px-3 py-6 text-center text-xs text-[var(--color-ink)]/40">
                    Drop here
                  </p>
                ) : (
                  cards.map((card) => (
                    <Card key={card.id} card={card} stages={stages} onMove={move} onDragStart={setDragId} pending={isPending} />
                  ))
                )}
                {(counts[s.key] ?? 0) > cards.length && (
                  <p className="px-1 text-xs text-[var(--color-ink)]/45">+{(counts[s.key] ?? 0) - cards.length} more…</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
