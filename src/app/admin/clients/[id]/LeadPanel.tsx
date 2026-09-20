"use client";

import { useActionState, useRef } from "react";
import { updateLeadAction, logLeadActivityAction, type ClientActionState } from "./actions";

interface StaffOption {
  id: string;
  name: string;
}
interface ActivityRow {
  id: string;
  kind: string;
  outcome: string | null;
  body: string | null;
  authorName?: string;
  createdAtIso: string;
}
interface StageOption {
  value: string;
  label: string;
}
interface LeadPanelProps {
  clientProfileId: string;
  stage: string;
  ownerId: string | null;
  direction: string | null;
  source: string | null;
  nextFollowUpIso: string | null;
  staff: StaffOption[];
  stages: StageOption[];
  activities: ActivityRow[];
}

const KINDS = ["CALL", "WHATSAPP", "EMAIL", "SMS", "NOTE"];
const initial: ClientActionState = {};
const CENTER_TZ = "Asia/Riyadh";
const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" });

function KindBadge({ kind }: { kind: string }) {
  const label = kind.replace("_", " ").toLowerCase();
  return (
    <span className="rounded-full bg-[var(--color-forest)]/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-forest)]">
      {label}
    </span>
  );
}

export function LeadPanel({ clientProfileId, stage, ownerId, direction, source, nextFollowUpIso, staff, stages, activities }: LeadPanelProps) {
  const [saveState, saveAction, savePending] = useActionState(updateLeadAction, initial);
  const [logState, logAction, logPending] = useActionState(logLeadActivityAction, initial);
  const logFormRef = useRef<HTMLFormElement>(null);
  const followUpValue = nextFollowUpIso ? nextFollowUpIso.slice(0, 10) : "";

  return (
    <div className="flex flex-col gap-6 lunia-card p-5" data-testid="lead-panel">
      {/* Pipeline controls */}
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="clientProfileId" value={clientProfileId} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {direction && (
            <span className="rounded-full bg-[var(--color-ink)]/8 px-2.5 py-0.5 font-medium text-[var(--color-ink)]/70">
              {direction === "OUTBOUND" ? "Outbound" : "Inbound"}
            </span>
          )}
          <span className="text-[var(--color-ink)]/50">Source: {source || "Not set"}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Stage</span>
            <select name="stage" defaultValue={stage} className="lunia-input" data-testid="lead-stage">
              {stages.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Owner</span>
            <select name="ownerId" defaultValue={ownerId ?? ""} className="lunia-input">
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Next follow-up</span>
            <input type="date" name="nextFollowUpAt" defaultValue={followUpValue} className="lunia-input" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={savePending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
            {savePending ? "Saving…" : "Save pipeline"}
          </button>
          {saveState.success && <span className="text-sm font-medium text-[var(--color-teal-ink)]">Saved.</span>}
          {saveState.error && <span role="alert" className="text-sm font-medium text-red-700">{saveState.error}</span>}
        </div>
      </form>

      <hr className="border-[var(--line)]" />

      {/* Log an outreach touch */}
      <form
        ref={logFormRef}
        action={async (fd) => {
          await logAction(fd);
          logFormRef.current?.reset();
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="clientProfileId" value={clientProfileId} />
        <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Log activity</span>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <select name="kind" className="lunia-input w-auto" defaultValue="CALL">
            {KINDS.map((k) => (
              <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <input name="outcome" type="text" placeholder="Outcome (e.g. No answer, Interested)" className="lunia-input" />
        </div>
        <textarea name="body" rows={2} placeholder="Notes (optional)" className="lunia-input" />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={logPending} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm w-fit disabled:opacity-60">
            {logPending ? "Adding…" : "Add activity"}
          </button>
          {logState.error && <span role="alert" className="text-sm font-medium text-red-700">{logState.error}</span>}
        </div>
      </form>

      {/* Activity timeline */}
      {activities.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {activities.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2">
              <div className="flex items-center gap-2">
                <KindBadge kind={a.kind} />
                {a.outcome && <span className="text-xs font-medium text-[var(--color-ink)]/70">{a.outcome.replace("_", " ")}</span>}
                <span className="ms-auto text-[0.7rem] text-[var(--color-ink)]/45">{dtFmt.format(new Date(a.createdAtIso))}</span>
              </div>
              {a.body && <p className="whitespace-pre-wrap text-sm text-[var(--color-ink)]/80">{a.body}</p>}
              {a.authorName && <span className="text-[0.7rem] text-[var(--color-ink)]/45">by {a.authorName}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
