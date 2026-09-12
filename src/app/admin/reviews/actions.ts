"use server";

// Server actions backing the admin Reviews moderation view (page.tsx +
// ReviewsTable.tsx). Every action re-checks CMS_MANAGE itself -- never
// trusts that the page that rendered the button already checked it --
// mirroring admin/waitlist/actions.ts and admin/commerce/actions.ts.
// Approve/reject are audited: publishing (or refusing to publish) a
// client's review is a moderation decision worth a trail.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { approveReview, rejectReview } from "@/modules/reviews/reviews";

export type ActionResult = { ok: true } | { ok: false; error: string };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function revalidateReviews(): void {
  revalidatePath("/admin/reviews");
}

export async function approveReviewAction(reviewId: string): Promise<ActionResult> {
  const admin = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  try {
    const review = await approveReview(reviewId);
    await recordAudit({
      actorUserId: admin.id,
      action: "REVIEW_APPROVE",
      entityType: "Review",
      entityId: review.id,
      summary: `Approved review "${review.id}" (rating ${review.rating}/5)`,
    });
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  revalidateReviews();
  return { ok: true };
}

export async function rejectReviewAction(reviewId: string): Promise<ActionResult> {
  const admin = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  try {
    const review = await rejectReview(reviewId);
    await recordAudit({
      actorUserId: admin.id,
      action: "REVIEW_REJECT",
      entityType: "Review",
      entityId: review.id,
      summary: `Rejected review "${review.id}"`,
    });
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  revalidateReviews();
  return { ok: true };
}
