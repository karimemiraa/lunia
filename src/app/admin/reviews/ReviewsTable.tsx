"use client";

import { useState, useTransition } from "react";
import { approveReviewAction, rejectReviewAction } from "./actions";
import { DataTable, type Column } from "../_ui/DataTable";
import { StatusPill } from "../_ui/StatusPill";
import { formatDateTime } from "../_ui/dates";
import { Spinner } from "../_ui/Form";

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

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`${rating} out of 5`} className="inline-flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true" className={`h-4 w-4 ${i < rating ? "text-[var(--color-tiger-lily,#c0ad73)]" : "text-[var(--color-ink)]/15"}`} fill="currentColor">
          <path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8Z" />
        </svg>
      ))}
    </span>
  );
}

function ModerationButtons({ reviewId }: { reviewId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function run(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const res = await fn(reviewId);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          aria-busy={isPending || undefined}
          data-testid={`review-approve-${reviewId}`}
          onClick={() => startTransition(() => run(approveReviewAction))}
          className="lunia-btn lunia-btn-forest lunia-btn-sm min-h-11 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending && <Spinner />}
          Approve
        </button>
        <button
          type="button"
          disabled={isPending}
          data-testid={`review-reject-${reviewId}`}
          onClick={() => startTransition(() => run(rejectReviewAction))}
          className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-[var(--status-danger-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

// Moderation table: submitted reviews (any status the page fetched), with
// approve/reject actions shown only for PENDING rows a CMS_MANAGE admin can
// act on.
export function ReviewsTable({ rows, canModerate }: ReviewsTableProps) {
  const columns: Column<ReviewRowDTO>[] = [
    {
      key: "clientName",
      header: "Customer",
      render: (r) => (
        <div className="flex flex-col">
          <span>{r.clientName ?? "Unknown"}</span>
          {r.authorDisplayName && <span className="text-xs text-[var(--color-ink)]/60">as “{r.authorDisplayName}”</span>}
        </div>
      ),
    },
    { key: "serviceName", header: "Service", render: (r) => r.serviceName ?? "None" },
    { key: "rating", header: "Rating", render: (r) => <Stars rating={r.rating} /> },
    {
      key: "title",
      header: "Review",
      sortable: false,
      className: "max-w-sm",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          {r.title && <span className="font-medium">{r.title}</span>}
          {r.body && <span className="text-xs leading-relaxed text-[var(--color-ink)]/70">{r.body}</span>}
        </div>
      ),
    },
    { key: "consentPublic", header: "Public", render: (r) => (r.consentPublic ? "Yes" : "No") },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
    { key: "submittedAtIso", header: "Submitted", value: (r) => r.submittedAtIso, render: (r) => (r.submittedAtIso ? formatDateTime(r.submittedAtIso) : "None") },
  ];
  if (canModerate) {
    columns.push({ key: "__actions", header: <span className="sr-only">Actions</span>, sortable: false, align: "end", render: (r) => (r.status === "PENDING" ? <ModerationButtons reviewId={r.id} /> : null) });
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      search={(r) => `${r.clientName ?? ""} ${r.serviceName ?? ""} ${r.title ?? ""} ${r.body ?? ""}`}
      searchPlaceholder="Search reviews…"
      initialSort={{ key: "submittedAtIso", dir: "desc" }}
      empty={{ title: "No reviews to show", description: "Reviews arrive after visits, once the customer opens the review link." }}
      ariaLabel="Reviews"
      cardsBelow="lg"
    />
  );
}
