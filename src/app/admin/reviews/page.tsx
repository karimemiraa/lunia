import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listReviewsForModeration, getAggregate } from "@/modules/reviews/reviews";
import { ReviewsTable, type ReviewRowDTO } from "./ReviewsTable";

interface ReviewsPageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_VALUES = ["PENDING", "APPROVED", "REJECTED"] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

function isStatusFilter(value: string | undefined): value is StatusFilter {
  return !!value && (STATUS_VALUES as readonly string[]).includes(value);
}

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const params = await searchParams;
  const statusFilter = isStatusFilter(params.status) ? params.status : "PENDING";

  const [reviews, aggregate] = await Promise.all([
    listReviewsForModeration({ status: statusFilter }),
    getAggregate(),
  ]);

  const rows: ReviewRowDTO[] = reviews.map((review) => ({
    id: review.id,
    clientName: review.clientProfile?.fullName ?? null,
    serviceName: review.service?.nameEn ?? null,
    rating: review.rating,
    title: review.title,
    body: review.body,
    authorDisplayName: review.authorDisplayName,
    consentPublic: review.consentPublic,
    status: review.status,
    submittedAtIso: review.tokenUsedAt ? review.tokenUsedAt.toISOString() : null,
    approvedAtIso: review.approvedAt ? review.approvedAt.toISOString() : null,
  }));

  return (
    <AdminShell
      user={user}
      title="Reviews"
      description="Moderate customer reviews collected after their visits. Approved + public-consent reviews feed the site's Testimonials and AggregateRating SEO data."
    >
      <p className="mb-6 text-sm text-[var(--color-ink)]/70">
        Public aggregate rating:{" "}
        {aggregate.count > 0 ? (
          <span className="font-semibold text-[var(--color-ink)]">
            {aggregate.avg.toFixed(1)} / 5 ({aggregate.count} review{aggregate.count === 1 ? "" : "s"})
          </span>
        ) : (
          <span className="text-[var(--color-ink)]/50">No published reviews yet.</span>
        )}
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_VALUES.map((status) => (
          <a
            key={status}
            href={`/admin/reviews?status=${status}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors ${
              statusFilter === status
                ? "bg-[var(--color-teal)] text-[var(--color-ink)]"
                : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/5"
            }`}
          >
            {status}
          </a>
        ))}
      </div>

      <ReviewsTable rows={rows} canModerate={user.permissions.has(PERMISSIONS.CMS_MANAGE)} />
    </AdminShell>
  );
}
