"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShowcaseAction, setShowcasePublishedAction } from "../../clients/[id]/clinical/actions";
import { useConfirm } from "../../_ui/ConfirmDialog";
import { toast } from "../../_components/toast";
import { useStaffT } from "../../_i18n/StaffI18n";

export interface ShowcaseRowDTO {
  id: string;
  clientProfileId: string;
  clientName: string;
  beforePhotoId: string;
  afterPhotoId: string;
  categoryLabel: string;
  captionEn: string;
  isPublished: boolean;
  consentOk: boolean;
  createdLabel: string;
}

/* eslint-disable @next/next/no-img-element -- private, auth-gated photo route */

function Row({ row }: { row: ShowcaseRowDTO }) {
  const router = useRouter();
  const t = useStaffT();
  const [confirm, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) {
        toast({ title: done, tone: "success" });
        router.refresh();
      } else setError(t(r.error));
    });
  return (
    <li className="lunia-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid="showcase-row">
      {confirmDialog}
      <div className="flex shrink-0 gap-1.5">
        {[row.beforePhotoId, row.afterPhotoId].map((id, i) => (
          <figure key={id} className="relative">
            <img src={`/admin/clinical/photo/${id}`} alt={i === 0 ? t("Before") : t("After")} className="h-24 w-20 rounded object-cover" loading="lazy" />
            <figcaption className="absolute start-1 top-1 rounded bg-black/55 px-1.5 text-[0.6rem] font-semibold uppercase text-white">{i === 0 ? t("Before") : t("After")}</figcaption>
          </figure>
        ))}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">
          {row.categoryLabel}
          {row.captionEn && <span className="font-normal text-[var(--color-ink)]/70"> · {row.captionEn}</span>}
        </p>
        <p className="text-xs text-[var(--color-ink)]/60">
          <Link href={`/admin/clients/${row.clientProfileId}/clinical/photos`} className="underline underline-offset-2">
            {row.clientName}
          </Link>{" "}
          · {t("added {date}", { date: row.createdLabel })}
        </p>
        {!row.consentOk && <p className="mt-1 text-xs text-[var(--color-danger)]">{t("Consent is no longer recorded on both photos — this pair can't be shown.")}</p>}
        {error && <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="lunia-pill" data-tone={row.isPublished ? "success" : "neutral"}>
          {row.isPublished ? t("On the website") : t("Hidden")}
        </span>
        <button
          type="button"
          disabled={pending || (!row.isPublished && !row.consentOk)}
          onClick={() => run(() => setShowcasePublishedAction(row.id, !row.isPublished), row.isPublished ? t("Removed from the website") : t("Published"))}
          className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11"
          data-testid="showcase-toggle"
        >
          {row.isPublished ? t("Unpublish") : t("Publish")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            if (await confirm({ title: t("Remove this pair from the gallery?"), description: t("The photos stay in the customer's file."), confirmLabel: t("Remove") })) {
              run(() => deleteShowcaseAction(row.id), t("Removed from the gallery"));
            }
          }}
          className="lunia-btn lunia-btn-danger lunia-btn-sm min-h-11"
        >
          {t("Remove")}
        </button>
      </div>
    </li>
  );
}

export function ShowcaseList({ rows }: { rows: ShowcaseRowDTO[] }) {
  return (
    <ul className="flex flex-col gap-3" data-testid="showcase-list">
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
    </ul>
  );
}
