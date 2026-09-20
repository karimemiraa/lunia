// Editable CRM pipeline stages (PipelineStage). Single source of truth for the
// stage list — the leads board, roster filters, lead panel, notifications and
// digests all read stages from here rather than a hardcoded enum. Stages are
// managed by the owner in the Superadmin panel.

import { prisma } from "@/lib/db";
import type { PipelineStage } from "@prisma/client";

export type StageKind = "open" | "won" | "lost";

export interface StageRow {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  kind: StageKind;
  color: string;
}

function toRow(s: PipelineStage): StageRow {
  const kind: StageKind = s.kind === "won" || s.kind === "lost" ? s.kind : "open";
  return { id: s.id, key: s.key, label: s.label, sortOrder: s.sortOrder, kind, color: s.color };
}

// All stages in display order. If the table is somehow empty (fresh/misseeded
// DB), returns a sensible built-in default so the CRM never renders blank.
export async function listStages(): Promise<StageRow[]> {
  const rows = await prisma.pipelineStage.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  if (rows.length === 0) return DEFAULT_STAGES;
  return rows.map(toRow);
}

const DEFAULT_STAGES: StageRow[] = [
  { id: "new", key: "new", label: "New enquiry", sortOrder: 1, kind: "open", color: "#9ed5d0" },
  { id: "contacted", key: "contacted", label: "Contacted", sortOrder: 2, kind: "open", color: "#c0ad73" },
  { id: "consultation", key: "consultation", label: "Consultation booked", sortOrder: 3, kind: "open", color: "#93ccc6" },
  { id: "active", key: "active", label: "Active client", sortOrder: 4, kind: "won", color: "#283d3c" },
  { id: "lost", key: "lost", label: "Lost", sortOrder: 5, kind: "lost", color: "#d92d20" },
];

export async function stageKeys(): Promise<string[]> {
  return (await listStages()).map((s) => s.key);
}

export async function stageLabelMap(): Promise<Map<string, StageRow>> {
  const stages = await listStages();
  return new Map(stages.map((s) => [s.key, s]));
}

export async function openStageKeys(): Promise<string[]> {
  return (await listStages()).filter((s) => s.kind === "open").map((s) => s.key);
}

// The default stage a new lead lands in (first open stage, else first stage).
export async function firstStageKey(): Promise<string> {
  const stages = await listStages();
  return (stages.find((s) => s.kind === "open") ?? stages[0])?.key ?? "new";
}

// --- Management (Superadmin) -------------------------------------------------

const KEY_RE = /^[a-z0-9_-]{1,40}$/;

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "stage";
}

export async function createStage(input: { label: string; kind: StageKind; color?: string }): Promise<void> {
  const label = input.label.trim();
  if (!label) throw new Error("A stage name is required.");
  // Derive a unique key from the label.
  let base = slugify(label);
  if (!KEY_RE.test(base)) base = "stage";
  let key = base;
  for (let i = 2; await prisma.pipelineStage.findUnique({ where: { key } }); i++) key = `${base}-${i}`;
  const max = await prisma.pipelineStage.aggregate({ _max: { sortOrder: true } });
  await prisma.pipelineStage.create({
    data: {
      key,
      label,
      kind: input.kind,
      color: input.color?.trim() || "#9ed5d0",
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateStage(id: string, input: { label?: string; kind?: StageKind; color?: string }): Promise<void> {
  const data: { label?: string; kind?: StageKind; color?: string } = {};
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new Error("A stage name is required.");
    data.label = label;
  }
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.color !== undefined && input.color.trim()) data.color = input.color.trim();
  await prisma.pipelineStage.update({ where: { id }, data });
}

// Deletes a stage, moving any leads on it to the first remaining stage so no
// customer is orphaned on a missing stage key.
export async function deleteStage(id: string): Promise<void> {
  const stage = await prisma.pipelineStage.findUnique({ where: { id } });
  if (!stage) return;
  const remaining = await prisma.pipelineStage.findMany({
    where: { id: { not: id } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (remaining.length === 0) throw new Error("You can't delete the last remaining stage.");
  const fallback = remaining.find((s) => s.kind === "open") ?? remaining[0];
  await prisma.$transaction([
    prisma.clientProfile.updateMany({ where: { stage: stage.key }, data: { stage: fallback.key } }),
    prisma.pipelineStage.delete({ where: { id } }),
  ]);
}

// Moves a stage one position up (dir -1) or down (dir +1) by swapping sortOrder
// with its neighbour.
export async function reorderStage(id: string, dir: -1 | 1): Promise<void> {
  const stages = await prisma.pipelineStage.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const idx = stages.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= stages.length) return;
  const a = stages[idx];
  const b = stages[swapIdx];
  await prisma.$transaction([
    prisma.pipelineStage.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.pipelineStage.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
}
