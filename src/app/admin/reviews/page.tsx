import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listReviewsForModeration, getAggregate } from "@/modules/reviews/reviews";
import { ReviewsTable, type ReviewRowDTO } from "./ReviewsTable";
import { KpiCard } from "../_ui/Layout";
import { FilterChips } from "../_ui/FilterBar";

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
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Public rating" value={aggregate.count > 0 ? `${aggregate.avg.toFixed(1)} / 5` : "—"} hint={aggregate.count > 0 ? `${aggregate.count} published review${aggregate.count === 1 ? "" : "s"}` : "No published reviews yet."} />
      </div>

      <FilterChips base="/admin/reviews" param="status" values={STATUS_VALUES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} active={statusFilter} defaultLabel="Pending" label="Review status" />
      <div className="mt-6">
        <ReviewsTable rows={rows} canModerate={user.permissions.has(PERMISSIONS.CMS_MANAGE)} />
      </div>
    </AdminShell>
  );
}
