"use client";

import { useTransition } from "react";
import { approveReviewAction, rejectReviewAction } from "./actions";

export interface ReviewRowDTO {
  id: string;
  clientName: string | null;
  serviceName: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  authorDisplayName: string | null;
  consentPublic: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAtIso: string | null;
  approvedAtIso: string | null;
}

interface ReviewsTableProps {
  rows: ReviewRowDTO[];
  canModerate: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-[var(--color-gold)]/25 text-[var(--color-ink)]",
  APPROVED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  REJECTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating}/5`} className="text-[var(--color-gold)]">
      {"★".repeat(rating)}
      <span className="text-[var(--color-ink)]/20">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function ModerationButtons({ reviewId }: { reviewId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isPending}
        data-testid={`review-approve-${reviewId}`}
        onClick={() => startTransition(async () => { await approveReviewAction(reviewId); })}
        className="rounded border border-[var(--color-canopy)]/40 px-3 py-1.5 text-xs font-medium text-[var(--color-canopy)] hover:bg-[var(--color-canopy)]/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "…" : "Approve"}
      </button>
      <button
        type="button"
        disabled={isPending}
        data-testid={`review-reject-${reviewId}`}
        onClick={() => startTransition(async () => { await rejectReviewAction(reviewId); })}
        className="rounded border border-[var(--color-ink)]/20 px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)]/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "…" : "Reject"}
      </button>
    </div>
  );
}

// Moderation table: submitted reviews (any status the page fetched), with
// approve/reject actions shown only for PENDING rows a CMS_MANAGE admin can
// act on.
export function ReviewsTable({ rows, canModerate }: ReviewsTableProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-dashed border-[var(--color-ink)]/20 px-4 py-8 text-center text-sm text-[var(--color-ink)]/60">
        No reviews to show.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--color-cream)]/60">
          <tr>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Client</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Service</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Rating</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Review</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Public?</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Status</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Submitted</th>
            {canModerate && <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-t border-[var(--color-ink)]/10 align-top"
              data-testid="review-row"
              data-review-id={row.id}
              data-review-status={row.status}
            >
              <td className="px-4 py-3 text-[var(--color-ink)]">
                <div className="flex flex-col">
                  <span>{row.clientName ?? "Unknown"}</span>
                  {row.authorDisplayName && (
                    <span className="text-xs text-[var(--color-ink)]/60">as “{row.authorDisplayName}”</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-[var(--color-ink)]">{row.serviceName ?? "—"}</td>
              <td className="px-4 py-3">
                <Stars rating={row.rating} />
              </td>
              <td className="max-w-sm px-4 py-3 text-[var(--color-ink)]">
                <div className="flex flex-col gap-0.5">
                  {row.title && <span className="font-medium">{row.title}</span>}
                  {row.body && <span className="text-xs text-[var(--color-ink)]/70">{row.body}</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-[var(--color-ink)]/70">{row.consentPublic ? "Yes" : "No"}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                    STATUS_STYLES[row.status] ?? "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70"
                  }`}
                >
                  {row.status}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--color-ink)]/70">
                {formatDateTime(row.submittedAtIso)}
              </td>
              {canModerate && (
                <td className="px-4 py-3">{row.status === "PENDING" && <ModerationButtons reviewId={row.id} />}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
