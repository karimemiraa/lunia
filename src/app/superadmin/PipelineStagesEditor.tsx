"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStageAction, updateStageAction, deleteStageAction, reorderStageAction } from "./actions";
import type { StageRow } from "@/modules/crm/pipeline";
import { ConfirmButton } from "@/app/admin/_ui/ConfirmDialog";
import { InlineStatus, SubmitButton } from "@/app/admin/_ui/Form";
import { Field, SelectField } from "@/app/admin/_ui/Field";

const KIND_LABELS: Record<string, string> = { open: "Open", won: "Won (converted)", lost: "Lost" };

const Chevron = ({ up }: { up: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    {up ? <path strokeLinecap="round" strokeLinejoin="round" d="m6 15 6-6 6 6" /> : <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />}
  </svg>
);

function StageRowItem({ stage, index, total }: { stage: StageRow; index: number; total: number }) {
  const router = useRouter();
  const [label, setLabel] = useState(stage.label);
  const [kind, setKind] = useState(stage.kind);
  const [color, setColor] = useState(stage.color);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
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
      setMsg(r.error ? { error: r.error } : { ok: "Saved." });
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
    start(async () => {
      const r = await deleteStageAction(stage.id);
      if (r.error) setMsg({ error: r.error });
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-end gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 p-3">
      <div className="flex gap-1 self-center">
        <button type="button" onClick={() => move(-1)} disabled={pending || index === 0} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)]/60 hover:bg-[var(--surface-2)] hover:text-[var(--color-ink)] disabled:opacity-30" aria-label={`Move ${stage.label} up`}>
          <Chevron up />
        </button>
        <button type="button" onClick={() => move(1)} disabled={pending || index === total - 1} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)]/60 hover:bg-[var(--surface-2)] hover:text-[var(--color-ink)] disabled:opacity-30" aria-label={`Move ${stage.label} down`}>
          <Chevron up={false} />
        </button>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/65">Colour</span>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-11 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line)] bg-transparent" aria-label={`${stage.label} colour`} />
      </label>
      <Field label="Stage name" name={`label-${stage.id}`} value={label} onChange={(e) => setLabel(e.target.value)} required className="min-w-[10rem] flex-1" />
      <SelectField label="Type" name={`kind-${stage.id}`} value={kind} onChange={(e) => setKind(e.target.value as StageRow["kind"])} inputClassName="w-auto">
        {Object.entries(KIND_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-11 disabled:opacity-60">
          Save
        </button>
        <ConfirmButton title={`Delete “${stage.label}”?`} description="Any leads on this stage move to the first stage. This cannot be undone." confirmLabel="Delete stage" onConfirm={remove} pending={pending}>
          Delete
        </ConfirmButton>
      </div>
      {msg && <InlineStatus success={msg.ok} error={msg.error} className="basis-full" />}
    </li>
  );
}

export function PipelineStagesEditor({ stages }: { stages: StageRow[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("open");
  const [color, setColor] = useState("#9ed5d0");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      setMsg({ error: "Enter a stage name." });
      return;
    }
    setMsg(null);
    const fd = new FormData();
    fd.set("label", label);
    fd.set("kind", kind);
    fd.set("color", color);
    start(async () => {
      const r = await createStageAction(null, fd);
      if (r.error) {
        setMsg({ error: r.error });
        return;
      }
      setLabel("");
      setMsg({ ok: "Stage added." });
      router.refresh();
    });
  }

  return (
    <div className="lunia-card flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">CRM pipeline stages</h2>
        <p className="text-sm text-[var(--color-ink)]/60">
          The stages a lead moves through on the Leads board. Reorder with the arrows, rename, recolour, or set each stage&rsquo;s type — <strong>Open</strong> (still working it), <strong>Won</strong> (became a client), or
          <strong> Lost</strong>. New leads land in the first Open stage.
        </p>
      </div>

      <ol className="flex flex-col gap-2" aria-label="Pipeline stages">
        {stages.map((s, i) => (
          <StageRowItem key={s.id} stage={s} index={i} total={stages.length} />
        ))}
      </ol>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/65">Colour</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-11 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--line)] bg-transparent" aria-label="New stage colour" />
        </label>
        <Field label="New stage" name="newLabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Follow-up" className="min-w-[12rem] flex-1" />
        <SelectField label="Type" name="newKind" value={kind} onChange={(e) => setKind(e.target.value)} inputClassName="w-auto">
          {Object.entries(KIND_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        <SubmitButton pending={pending} pendingLabel="Adding…">
          Add stage
        </SubmitButton>
      </form>
      {msg && <InlineStatus success={msg.ok} error={msg.error} />}
    </div>
  );
}
