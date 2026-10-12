"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShowcaseAction, deletePhotoAction, setPhotoShareConsentAction, updatePhotoAction } from "../actions";
import { SHOWCASE_CATEGORIES, type ShowcaseCategory } from "@/modules/clinical/showcase.shared";
import { toast } from "../../../../_components/toast";
import type { PhotoKind } from "@/modules/clinical/photos";
import { useConfirm } from "../../../../_ui/ConfirmDialog";

export interface PhotoDTO {
  id: string;
  kind: PhotoKind;
  area: string | null;
  device: string | null;
  note: string | null;
  treatmentRecordId: string | null;
  takenAtLabel: string;
  consentToShare: boolean;
}

const KIND_LABEL: Record<PhotoKind, string> = { BEFORE: "Before", AFTER: "After", ANALYSIS: "Analysis", OTHER: "Other" };
const src = (id: string) => `/admin/clinical/photo/${id}`;

/* eslint-disable @next/next/no-img-element -- private, auth-gated route; next/image would proxy it through the optimizer */

// Before/after comparison: side by side, or overlaid with a draggable divider.
function Compare({ a, b, onClose }: { a: PhotoDTO; b: PhotoDTO; onClose: () => void }) {
  const [mode, setMode] = useState<"side" | "slider">("slider");
  const [pos, setPos] = useState(50);
  const caption = (p: PhotoDTO) => `${KIND_LABEL[p.kind]} · ${p.takenAtLabel}${p.area ? ` · ${p.area}` : ""}`;

  return (
    <section className="lunia-card flex flex-col gap-4 p-4 sm:p-5" data-testid="photo-compare">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-[var(--surface-2)] p-1">
          {(["slider", "side"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${mode === m ? "bg-white shadow-sm" : "text-[var(--color-ink)]/60"}`}
            >
              {m === "slider" ? "Slider" : "Side by side"}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
          Close compare
        </button>
      </div>
      {mode === "side" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[a, b].map((p) => (
            <figure key={p.id} className="flex flex-col gap-1.5">
              <img src={src(p.id)} alt={caption(p)} className="max-h-[70vh] w-full rounded-[var(--radius-sm)] bg-black/5 object-contain" />
              <figcaption className="text-xs text-[var(--color-ink)]/60">{caption(p)}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative mx-auto w-full max-w-3xl select-none overflow-hidden rounded-[var(--radius-sm)] bg-black/5">
            <img src={src(b.id)} alt={caption(b)} className="block max-h-[70vh] w-full object-contain" draggable={false} />
            <img
              src={src(a.id)}
              alt={caption(a)}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
              draggable={false}
            />
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
            <span className="absolute start-2 top-2 rounded bg-black/55 px-2 py-0.5 text-xs text-white">{KIND_LABEL[a.kind]}</span>
            <span className="absolute end-2 top-2 rounded bg-black/55 px-2 py-0.5 text-xs text-white">{KIND_LABEL[b.kind]}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Compare divider"
            className="mx-auto h-11 w-full max-w-3xl accent-[var(--color-teal)]"
          />
          <p className="text-center text-xs text-[var(--color-ink)]/60">
            Left: {caption(a)} · Right: {caption(b)}
          </p>
        </div>
      )}
    </section>
  );
}

function PhotoCard({
  photo,
  selected,
  onSelect,
  recordLabel,
}: {
  photo: PhotoDTO;
  selected: boolean;
  onSelect: () => void;
  recordLabel: string | null;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<PhotoKind>(photo.kind);
  const [area, setArea] = useState(photo.area ?? "");
  const [note, setNote] = useState(photo.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const r = await updatePhotoAction(photo.id, { kind, area: area || null, note: note || null });
      if (r.ok) {
        setEditing(false);
        router.refresh();
      } else setError(r.error);
    });
  const toggleConsent = async () => {
    const next = !photo.consentToShare;
    if (
      next &&
      !(await confirm({
        title: "Record consent to share this photo?",
        description: "Only do this if the customer agreed (in writing) that this photo may appear on the Lunia website. Their name is never shown.",
        confirmLabel: "Customer agreed",
        danger: false,
      }))
    )
      return;
    startTransition(async () => {
      const r = await setPhotoShareConsentAction(photo.id, next);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };
  const remove = async () => {
    if (!(await confirm({ title: "Delete this photo permanently?", confirmLabel: "Delete" }))) return;
    startTransition(async () => {
      const r = await deletePhotoAction(photo.id);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  return (
    <li id={`photo-${photo.id}`} className={`lunia-card flex flex-col overflow-hidden ${selected ? "ring-2 ring-[var(--color-teal)]" : ""}`}>
      {confirmDialog}
      <a href={src(photo.id)} target="_blank" rel="noreferrer" className="relative block bg-black/5">
        <img src={src(photo.id)} alt={`${KIND_LABEL[photo.kind]} ${photo.area ?? ""}`} loading="lazy" className="aspect-[4/5] w-full object-cover" />
        <span className="absolute start-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-white">{KIND_LABEL[photo.kind]}</span>
        {photo.consentToShare && (
          <span className="absolute end-2 top-2 rounded bg-[var(--color-teal-ink)] px-2 py-0.5 text-[0.65rem] font-semibold text-white" data-testid="photo-shareable">
            Shareable
          </span>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-2 p-3 text-xs text-[var(--color-ink)]/70">
        <p className="font-medium text-[var(--color-ink)]">{photo.takenAtLabel}</p>
        {photo.area && <p>Area: {photo.area}</p>}
        {photo.device && <p>Device: {photo.device}</p>}
        {recordLabel && <p>Session: {recordLabel}</p>}
        {photo.note && <p className="whitespace-pre-wrap">{photo.note}</p>}
        {editing && (
          <div className="flex flex-col gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as PhotoKind)} className="lunia-input min-h-11 text-sm">
              {(Object.keys(KIND_LABEL) as PhotoKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" className="lunia-input min-h-11 text-sm" maxLength={80} />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="lunia-input min-h-11 text-sm" maxLength={500} />
          </div>
        )}
        <label className="flex min-h-11 items-center gap-2 text-[var(--color-ink)]">
          <input type="checkbox" checked={photo.consentToShare} onChange={toggleConsent} disabled={pending} className="h-4 w-4" data-testid="photo-share-consent" />
          Customer consented to show it on the website
        </label>
        {error && <p className="text-red-700">{error}</p>}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <button type="button" onClick={onSelect} aria-pressed={selected} className={`lunia-btn lunia-btn-sm min-h-11 ${selected ? "lunia-btn-forest" : "lunia-btn-ghost"}`}>
            {selected ? "Selected" : "Compare"}
          </button>
          {editing ? (
            <button type="button" onClick={save} disabled={pending} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
              Save
            </button>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
              Edit
            </button>
          )}
          <button type="button" onClick={remove} disabled={pending} className="lunia-btn lunia-btn-danger lunia-btn-sm min-h-11">
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

// Turn a compared Before + After into a website gallery pair.
function AddToGallery({ a, b }: { a: PhotoDTO; b: PhotoDTO }) {
  const router = useRouter();
  const before = a.kind === "BEFORE" ? a : b.kind === "BEFORE" ? b : null;
  const after = a.kind === "AFTER" ? a : b.kind === "AFTER" ? b : null;
  const [category, setCategory] = useState<ShowcaseCategory>("skin");
  const [captionEn, setCaptionEn] = useState("");
  const [captionAr, setCaptionAr] = useState("");
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!before || !after) {
    return <p className="text-sm text-[var(--color-ink)]/60">To add these to the website gallery, compare one photo labelled Before with one labelled After.</p>;
  }
  if (!before.consentToShare || !after.consentToShare) {
    return <p className="text-sm text-[var(--color-ink)]/60">To add this pair to the website gallery, first record the customer&apos;s consent to share on both photos.</p>;
  }
  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await createShowcaseAction({ beforePhotoId: before.id, afterPhotoId: after.id, category, captionEn, captionAr, publish });
      if (r.ok) {
        toast({ title: publish ? "Published to the website gallery" : "Saved to the gallery (not published yet)", tone: "success" });
        router.refresh();
      } else setError(r.error);
    });
  return (
    <section className="lunia-card flex flex-col gap-3 p-4" data-testid="add-to-gallery">
      <h3 className="text-sm font-semibold">Add this pair to the website results gallery</h3>
      <p className="text-xs text-[var(--color-ink)]/60">Shown without the customer&apos;s name or dates. You can unpublish it at any time from Website → Results gallery.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as ShowcaseCategory)} className="lunia-input min-h-11 text-sm" name="category">
            {SHOWCASE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Caption (English, optional)
          <input value={captionEn} onChange={(e) => setCaptionEn(e.target.value)} maxLength={140} className="lunia-input min-h-11 text-sm" placeholder="e.g. 3 sessions of HydraFacial" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Caption (Arabic, optional)
          <input value={captionAr} onChange={(e) => setCaptionAr(e.target.value)} maxLength={140} dir="rtl" className="lunia-input min-h-11 text-sm" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4" />
        Publish now
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" onClick={submit} disabled={pending} className="lunia-btn lunia-btn-forest w-fit min-h-11" data-testid="add-to-gallery-submit">
        Add to gallery
      </button>
    </section>
  );
}

export function PhotoGallery({ photos, recordLabels }: { photos: PhotoDTO[]; recordLabels: Record<string, string> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2)));
  const [a, b] = selected.map((id) => photos.find((p) => p.id === id)).filter((p): p is PhotoDTO => Boolean(p));

  if (photos.length === 0) {
    return (
      <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
        No photos yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {a && b ? (
        <>
          <Compare a={a} b={b} onClose={() => setSelected([])} />
          <AddToGallery key={`${a.id}-${b.id}`} a={a} b={b} />
        </>
      ) : (
        <p className="text-sm text-[var(--color-ink)]/60">Select two photos with Compare to see them before/after.</p>
      )}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <PhotoCard
            key={p.id}
            photo={p}
            selected={selected.includes(p.id)}
            onSelect={() => toggle(p.id)}
            recordLabel={p.treatmentRecordId ? (recordLabels[p.treatmentRecordId] ?? null) : null}
          />
        ))}
      </ul>
    </div>
  );
}
