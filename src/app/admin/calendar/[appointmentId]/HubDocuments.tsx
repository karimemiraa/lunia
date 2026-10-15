"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocumentAction, deleteDocumentAction, type HubActionState } from "./actions";
import type { HubDocument } from "@/modules/booking/appointmentHub";
import { InlineStatus } from "../../_ui/Form";
import { ConfirmButton } from "../../_ui/ConfirmDialog";
import { useStaffLocale, useStaffT } from "../../_i18n/StaffI18n";
import { intlLocale } from "../../_i18n/t";

interface HubDocumentsProps {
  appointmentId: string;
  bookingId: string;
  clientProfileId: string;
  documents: HubDocument[];
  canManage: boolean;
}

const CATEGORIES = [
  { value: "RECEIPT", label: "Receipt" },
  { value: "LAB", label: "Lab result" },
  { value: "FORM", label: "Signed form" },
  { value: "REPORT", label: "Report" },
  { value: "ID", label: "ID" },
  { value: "OTHER", label: "Other" },
];
const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.value, c.label]));

const initialState: HubActionState = {};
const CENTER_TZ = "Asia/Riyadh";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const chip = "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium";

// Visit documents: upload (BOOKING_MANAGE) plus the list, each a private
// download link served by /admin/documents/[id]. PDFs and images only.
export function HubDocuments({ appointmentId, bookingId, clientProfileId, documents, canManage }: HubDocumentsProps) {
  const router = useRouter();
  const t = useStaffT();
  const locale = useStaffLocale();
  const dFmt = new Intl.DateTimeFormat(intlLocale(locale, "en-US"), { timeZone: CENTER_TZ, dateStyle: "medium" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("RECEIPT");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    const fd = new FormData();
    fd.set("appointmentId", appointmentId);
    fd.set("bookingId", bookingId);
    fd.set("clientProfileId", clientProfileId);
    fd.set("category", category);
    fd.set("note", note);
    fd.set("file", file, file.name);
    const result = await uploadDocumentAction(fd).catch(() => ({ ok: false as const, error: t("Upload failed.") }));
    setBusy(false);
    if (result.ok) {
      setStatus(t("Document uploaded."));
      setNote("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <form onSubmit={upload} data-testid="hub-document-form" className="flex flex-col gap-3 lunia-card p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--color-ink)]">{t("Type")}</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="lunia-input min-h-11" aria-label={t("Document type")}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--color-ink)]">{t("Note (optional)")}</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t("e.g. consent signed, blood panel")} className="lunia-input min-h-11" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="lunia-btn lunia-btn-ghost min-h-11 cursor-pointer">
              {t("Choose file")}
              <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <span className="text-sm text-[var(--color-ink)]/60">{file ? file.name : t("PDF, JPG, PNG, WebP or HEIC, up to 25MB")}</span>
            <button type="submit" disabled={busy || !file} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-50">
              {busy ? t("Uploading…") : t("Upload")}
            </button>
          </div>
          {status && <p role="status" className="text-sm text-[var(--color-teal)]">{status}</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {documents.length === 0 ? (
        <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
          {t("No documents on this visit yet.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="hub-documents-list">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] px-4 py-2.5">
              <a href={`/admin/documents/${d.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2.5 text-sm">
                <span className={`${chip} bg-[var(--color-teal)]/15 text-[var(--color-teal-ink)]`}>{t(CATEGORY_LABEL.get(d.category) ?? d.category)}</span>
                <span className="truncate font-medium text-[var(--color-ink)] hover:underline">{d.fileName}</span>
                <span className="shrink-0 text-xs text-[var(--color-ink)]/45"><span dir="ltr">{formatBytes(d.sizeBytes)}</span> · {dFmt.format(d.createdAt)}</span>
              </a>
              {canManage && <DeleteButton appointmentId={appointmentId} documentId={d.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeleteButton({ appointmentId, documentId }: { appointmentId: string; documentId: string }) {
  const [state, action, pending] = useActionState(deleteDocumentAction, initialState);
  const t = useStaffT();
  return (
    <form action={action}>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="documentId" value={documentId} />
      <ConfirmButton title={t("Delete this document?")} description={t("This cannot be undone.")} confirmLabel={t("Delete")} pending={pending} className="lunia-btn lunia-btn-ghost lunia-btn-sm text-red-700">
        {pending ? t("Deleting…") : t("Delete")}
      </ConfirmButton>
      <InlineStatus size="sm" error={state.error} className="ms-2" />
    </form>
  );
}
