"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPhotoAction } from "../actions";

interface PhotoUploaderProps {
  clientProfileId: string;
  records: { id: string; label: string }[];
  defaultRecordId: string | null;
}

const KINDS = [
  { value: "BEFORE", label: "Before" },
  { value: "AFTER", label: "After" },
  { value: "ANALYSIS", label: "Skin analysis" },
  { value: "OTHER", label: "Other" },
];

const MAX_EDGE = 3000;

// Re-encodes JPEG/PNG/WebP through a canvas before upload: downsizes huge
// camera files and drops EXIF (GPS location, device serials) while keeping the
// visual orientation (createImageBitmap applies it). Anything the browser
// can't decode (e.g. HEIC outside Safari) is uploaded unchanged.
async function prepare(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function PhotoUploader({ clientProfileId, records, defaultRecordId }: PhotoUploaderProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("BEFORE");
  const [area, setArea] = useState("");
  const [device, setDevice] = useState("");
  const [note, setNote] = useState("");
  const [recordId, setRecordId] = useState(defaultRecordId ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setBusy(true);
    setErrors([]);
    const failed: string[] = [];
    // One request per file keeps each under the server-action body limit.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      const blob = await prepare(file);
      const fd = new FormData();
      fd.set("clientProfileId", clientProfileId);
      fd.set("file", blob, file.name);
      fd.set("kind", kind);
      fd.set("area", area);
      fd.set("device", device);
      fd.set("note", note);
      fd.set("treatmentRecordId", recordId);
      if (file.lastModified) fd.set("takenAt", new Date(file.lastModified).toISOString());
      const result = await uploadPhotoAction(fd).catch(() => ({ ok: false as const, error: "Upload failed." }));
      if (!result.ok) failed.push(`${file.name}: ${result.error}`);
    }
    setBusy(false);
    setProgress(failed.length ? null : `Uploaded ${files.length} photo${files.length === 1 ? "" : "s"}.`);
    setErrors(failed);
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <form onSubmit={upload} className="flex flex-col gap-4" data-testid="photo-uploader">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Photo type">
        {KINDS.map((k) => (
          <label
            key={k.value}
            className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm ${
              kind === k.value ? "border-[var(--color-teal)] bg-[var(--color-teal)]/15" : "border-[var(--line-strong)] text-[var(--color-ink)]/70"
            }`}
          >
            <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
            {k.label}
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area (e.g. left cheek, crown)" className="lunia-input min-h-11" maxLength={80} />
        <input
          value={device}
          onChange={(e) => setDevice(e.target.value)}
          placeholder={kind === "ANALYSIS" ? "Analyzer (e.g. Observ 520x)" : "Device / camera (optional)"}
          className="lunia-input min-h-11"
          maxLength={120}
        />
        <select value={recordId} onChange={(e) => setRecordId(e.target.value)} className="lunia-input min-h-11" aria-label="Link to treatment record">
          <option value="">Not linked to a session</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="lunia-input min-h-11" maxLength={500} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* capture opens the camera on iPad/iPhone; multiple allows bulk import of analyzer exports from Files. */}
        <label className="lunia-btn lunia-btn-ghost min-h-11 cursor-pointer">
          Take photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <label className="lunia-btn lunia-btn-ghost min-h-11 cursor-pointer">
          Choose files
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <span className="text-sm text-[var(--color-ink)]/60">{files.length ? `${files.length} selected` : "JPG, PNG, WebP or HEIC, up to 20MB each"}</span>
        <button type="submit" disabled={busy || files.length === 0} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-50">
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {progress && <p role="status" className="text-sm text-[var(--color-ink)]/70">{progress}</p>}
      {errors.length > 0 && (
        <ul role="alert" className="text-sm text-red-700">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
