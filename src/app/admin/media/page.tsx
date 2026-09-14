import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listMedia } from "@/modules/cms/media";
import { updateAlt, deleteMediaAction } from "./actions";
import { UploadForm } from "./UploadForm";
import { DeleteButton } from "./DeleteButton";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

const inputClass =
  "rounded border border-[var(--color-ink)]/20 px-2 py-1 text-xs text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

export default async function MediaLibraryPage() {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const media = await listMedia();

  return (
    <AdminShell user={user} title="Media" description="Upload and manage images and video used across the site.">
      <div className="mb-8">
        <UploadForm />
      </div>

      {media.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/60">No media uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {media.map((item) => (
            <div
              key={item.id}
              data-testid="media-item"
              data-media-id={item.id}
              className="flex flex-col gap-2 rounded border border-[var(--color-ink)]/10 p-3"
            >
              <div className="flex h-32 items-center justify-center overflow-hidden rounded bg-[var(--color-cream)]/50">
                {item.kind === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded assets, no static domain to configure for next/image
                  <img
                    src={`/api/media/${item.storageKey}`}
                    alt={item.altEn ?? item.filename}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video src={`/api/media/${item.storageKey}`} className="h-full w-full object-cover" muted controls />
                )}
              </div>

              <p className="truncate text-xs font-medium text-[var(--color-ink)]" title={item.filename}>
                {item.filename}
              </p>
              <p className="text-[11px] text-[var(--color-ink)]/60">
                {formatBytes(item.sizeBytes)}
                {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
              </p>

              <form action={updateAlt} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={item.id} />
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-ink)]/70">Alt (EN)</span>
                  <input type="text" name="altEn" defaultValue={item.altEn ?? ""} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-ink)]/70">Alt (AR)</span>
                  <input type="text" name="altAr" dir="rtl" defaultValue={item.altAr ?? ""} className={inputClass} />
                </label>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <button
                    type="submit"
                    className="lunia-btn lunia-btn-primary lunia-btn-sm"
                  >
                    Save alt text
                  </button>
                  <DeleteButton action={deleteMediaAction} />
                </div>
              </form>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
