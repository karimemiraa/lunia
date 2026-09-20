"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStageAction, updateStageAction, deleteStageAction, reorderStageAction } from "./actions";
import type { StageRow } from "@/modules/crm/pipeline";

const KIND_LABELS: Record<string, string> = { open: "Open", won: "Won (converted)", lost: "Lost" };

function StageRowItem({ stage, index, total }: { stage: StageRow; index: number; total: number }) {
  const router = useRouter();
  const [label, setLabel] = useState(stage.label);
  const [kind, setKind] = useState(stage.kind);
  const [color, setColor] = useState(stage.color);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    const fd = new FormData();
    fd.set("id", stage.id);
    fd.set("label", label);
    fd.set("kind", kind);
    fd.set("color", color);
    start(async () => {
      const r = await updateStageAction(null, fd);
      setMsg(r.error ?? "Saved ✓");
      router.refresh();
    });
  }
  function move(dir: -1 | 1) {
    start(async () => {
      await reorderStageAction(stage.id, dir);
      router.refresh();
    });
  }
  function remove() {
    if (!window.confirm(`Delete stage "${stage.label}"? Any leads on it move to the first stage.`)) return;
    start(async () => {
      const r = await deleteStageAction(stage.id);
      if (r.error) setMsg(r.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 p-2.5">
      <div className="flex flex-col">
        <button type="button" onClick={() => move(-1)} disabled={pending || index === 0} className="px-1 text-xs text-[var(--color-ink)]/50 hover:text-[var(--color-ink)] disabled:opacity-30" aria-label="Move up">▲</button>
        <button type="button" onClick={() => move(1)} disabled={pending || index === total - 1} className="px-1 text-xs text-[var(--color-ink)]/50 hover:text-[var(--color-ink)] disabled:opacity-30" aria-label="Move down">▼</button>
      </div>
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded border border-[var(--line)] bg-transparent" aria-label="Stage color" />
      <input value={label} onChange={(e) => setLabel(e.target.value)} className="lunia-input min-w-[10rem] flex-1 py-1.5 text-sm" aria-label="Stage name" />
      <select value={kind} onChange={(e) => setKind(e.target.value as StageRow["kind"])} className="lunia-input w-auto py-1.5 text-sm" aria-label="Stage type">
        {Object.entries(KIND_LABELS).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <button type="button" onClick={save} disabled={pending} className="lunia-btn lunia-btn-forest lunia-btn-sm disabled:opacity-60">Save</button>
      <button type="button" onClick={remove} disabled={pending} className="lunia-btn lunia-btn-danger lunia-btn-sm disabled:opacity-60">Delete</button>
      {msg && <span className="text-xs text-[var(--color-ink)]/55">{msg}</span>}
    </div>
  );
}

export function PipelineStagesEditor({ stages }: { stages: StageRow[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("open");
  const [color, setColor] = useState("#9ed5d0");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    if (!label.trim()) { setMsg("Enter a stage name."); return; }
    setMsg(null);
    const fd = new FormData();
    fd.set("label", label);
    fd.set("kind", kind);
    fd.set("color", color);
    start(async () => {
      const r = await createStageAction(null, fd);
      if (r.error) { setMsg(r.error); return; }
      setLabel("");
      router.refresh();
    });
  }

  return (
    <div className="lunia-card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">CRM pipeline stages</h2>
        <p className="text-sm text-[var(--color-ink)]/60">
          The stages a lead moves through on the Leads board. Reorder with the arrows, rename, recolor, or set each
          stage&rsquo;s type — <strong>Open</strong> (still working it), <strong>Won</strong> (became a client), or
          <strong> Lost</strong>. New leads land in the first Open stage.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {stages.map((s, i) => (
          <StageRowItem key={s.id} stage={s} index={i} total={stages.length} />
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-4">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded border border-[var(--line)] bg-transparent" aria-label="New stage color" />
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">New stage</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Follow-up" className="lunia-input py-1.5 text-sm" />
        </label>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="lunia-input w-auto py-1.5 text-sm" aria-label="New stage type">
          {Object.entries(KIND_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={pending} className="lunia-btn lunia-btn-forest shrink-0 disabled:opacity-60">
          {pending ? "Adding…" : "Add stage"}
        </button>
      </div>
      {msg && <span className="text-xs text-[var(--color-ink)]/55">{msg}</span>}
    </div>
  );
}
