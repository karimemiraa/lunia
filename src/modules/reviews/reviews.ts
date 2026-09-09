// Reviews & reputation engine.
//
// Design note (the build brief explicitly left the token/row design open):
// the Review row is created UP FRONT, at request time (scheduleReviewRequest,
// called best-effort from bookings.ts's complete()), not lazily when the
// client submits. It starts life with `rating: 0` (a sentinel meaning "not
// submitted yet" -- the service layer enforces 1..5 on every real write) and
// a fresh unguessable `token`. This keeps the whole feature on one table:
// the public submit page resolves the token straight to a Review row, and
// single-use enforcement is just "is tokenUsedAt already set on this row",
// with no separate token store to keep in sync. submitReview then fills in
// the actual content (rating/title/body/authorDisplayName/consentPublic) and
// stamps tokenUsedAt, atomically and exactly once.

import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { Review } from "@prisma/client";
import { scheduleMessage } from "@/modules/booking/outbox";
import { localized } from "@/modules/catalog/localize";
import { getEnv } from "@/lib/env";

// Same "starts with ar" normalization used by outbox.ts/waitlist.ts.
function toLocale(locale: string): "en" | "ar" {
  return locale.toLowerCase().startsWith("ar") ? "ar" : "en";
}

function resolveAppUrl(): string {
  try {
    return getEnv().APP_URL;
  } catch {
    return "http://localhost:3000";
  }
}

const UNIQUE_CONSTRAINT_CODE = "P2002";

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_CODE;
}

// Crypto-random (never Math.random), URL-safe, 256 bits of entropy -- this
// is a machine-followed link, not something a human types, so there's no
// need for the gift-card code's readability grouping.
function generateReviewToken(): string {
  return randomBytes(32).toString("base64url");
}

// How long after a visit the review request goes out. A module constant
// (like waitlist.ts's WAITLIST_NOTIFY_LIMIT), not a SiteSetting -- flag if
// ops wants this tunable without a deploy.
export const REVIEW_DELAY_DAYS = 2;

// The subset of a Booking (+ its appointments) scheduleReviewRequest needs.
// Deliberately NOT importing BookingWithAppointments from bookings.ts here:
// bookings.ts already imports this module (to call scheduleReviewRequest
// from complete()), so importing its types back would set up a needless
// cycle. Any object with this shape (e.g. the BookingWithAppointments
// fetched inside complete()) satisfies it structurally.
export interface BookingForReviewRequest {
  id: string;
  clientProfileId: string;
  appointments: { serviceId: string }[];
}

/**
 * Called best-effort from bookings.ts's complete(). Creates the Review row
 * (PENDING, unsubmitted, fresh token) for this booking -- idempotent: a
 * second call for the same bookingId (e.g. complete() somehow re-run) just
 * returns the row already created rather than erroring or duplicating --
 * and, when the client has a reachable phone/email and hasn't opted out,
 * schedules a REVIEW_REQUEST message for `completedAt + REVIEW_DELAY_DAYS`
 * days containing the tokenized `/{locale}/review/<token>` link. Passing
 * clientProfileId to scheduleMessage is what makes the outbox's existing
 * opt-out logic apply (REVIEW_REQUEST shares POST_VISIT's postVisitOptIn
 * flag -- see outbox.ts's isOptedOut). Never throws in a way the caller
 * needs to treat specially beyond its own try/catch -- a missing/undeliverable
 * recipient just means no message gets scheduled; the Review row (and its
 * token) still exists for e.g. a front-desk kiosk prompt.
 */
export async function scheduleReviewRequest(
  booking: BookingForReviewRequest,
  opts: { completedAt: Date },
): Promise<Review> {
  const existing = await prisma.review.findUnique({ where: { bookingId: booking.id } });
  if (existing) return existing;

  const serviceId = booking.appointments[0]?.serviceId ?? null;
  const client = await prisma.clientProfile.findUnique({
    where: { id: booking.clientProfileId },
    include: { user: true },
  });
  const locale = toLocale(client?.user.locale ?? "ar");

  let review: Review;
  try {
    review = await prisma.review.create({
      data: {
        clientProfileId: booking.clientProfileId,
        bookingId: booking.id,
        serviceId,
        locale,
        token: generateReviewToken(),
        status: "PENDING",
      },
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      // Race: another concurrent call already created it for this booking
      // (or, astronomically unlikely, a token collision -- either way the
      // bookingId row is now guaranteed to exist).
      const raced = await prisma.review.findUnique({ where: { bookingId: booking.id } });
      if (raced) return raced;
    }
    throw err;
  }

  const toPhone = client?.user.phone ?? undefined;
  const toEmail = client?.user.email ?? undefined;
  if (!toPhone && !toEmail) return review;

  const link = `${resolveAppUrl()}/${locale}/review/${review.token}`;
  const sendAt = new Date(opts.completedAt.getTime() + REVIEW_DELAY_DAYS * 86_400_000);

  const service = serviceId ? await prisma.service.findUnique({ where: { id: serviceId } }) : null;

  await scheduleMessage({
    kind: "REVIEW_REQUEST",
    bookingId: booking.id,
    clientProfileId: booking.clientProfileId,
    toPhone,
    toEmail,
    locale,
    sendAt,
    payload: {
      bookingId: booking.id,
      link,
      ...(service ? { serviceName: localized(locale, service.nameEn, service.nameAr) } : {}),
    },
  });

  return review;
}

/** Resolves a review-submit token to its Review row, or null if unknown. Callers check tokenUsedAt themselves to render an "already submitted" state vs a fresh form. */
export async function getReviewByToken(token: string): Promise<Review | null> {
  if (!token) return null;
  return prisma.review.findUnique({ where: { token } });
}

const submitReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional(),
  body: z.string().trim().max(4000).optional(),
  authorDisplayName: z.string().trim().max(120).optional(),
  consentPublic: z.boolean().default(false),
});
export type SubmitReviewInput = z.input<typeof submitReviewSchema>;

/**
 * Submits the content for a pending review token, exactly once. Race-safe:
 * the single conditional updateMany (token matches AND tokenUsedAt is still
 * null) is the only write, so two concurrent submits for the same token can
 * never both succeed -- the loser sees `result.count === 0` and is told the
 * review was already submitted, mirroring the outbox's claim-scoped
 * finalizeMessage pattern. Stays in status PENDING (moderation-required).
 */
export async function submitReview(token: string, input: SubmitReviewInput): Promise<Review> {
  const data = submitReviewSchema.parse(input);
  if (!token) throw new Error("Invalid review link");

  const result = await prisma.review.updateMany({
    where: { token, tokenUsedAt: null },
    data: {
      rating: data.rating,
      title: data.title || null,
      body: data.body || null,
      authorDisplayName: data.authorDisplayName || null,
      consentPublic: data.consentPublic,
      tokenUsedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    const existing = await prisma.review.findUnique({ where: { token } });
    if (!existing) throw new Error("Invalid review link");
    throw new Error("This review has already been submitted");
  }

  return prisma.review.findUniqueOrThrow({ where: { token } });
}

/** Approves a submitted review (admin moderation). Refuses a row that was never actually submitted (rating is still the 0 sentinel / tokenUsedAt unset) so an empty placeholder can never be published. */
export async function approveReview(id: string): Promise<Review> {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new Error(`Review "${id}" not found`);
  if (!review.tokenUsedAt || review.rating < 1 || review.rating > 5) {
    throw new Error("Cannot approve a review that has not been submitted yet");
  }
  return prisma.review.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
}

/** Rejects a review (admin moderation). Clears approvedAt in case a previously-approved review is later reversed. */
export async function rejectReview(id: string): Promise<Review> {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new Error(`Review "${id}" not found`);
  return prisma.review.update({ where: { id }, data: { status: "REJECTED", approvedAt: null } });
}

export interface ReviewAggregate {
  avg: number;
  count: number;
}

/**
 * Average rating + count over APPROVED reviews that also have consentPublic
 * set -- the same gate listApprovedReviews uses, so a JSON-LD/Testimonials
 * aggregate never counts a review whose author never agreed to appear
 * publicly. Optionally scoped to one service. avg is 0 when count is 0
 * (callers must check count>0 before ever rendering/publishing the
 * aggregate -- an AggregateRating with zero reviews should never be emitted).
 */
export async function getAggregate(filter: { serviceId?: string } = {}): Promise<ReviewAggregate> {
  const result = await prisma.review.aggregate({
    where: {
      status: "APPROVED",
      consentPublic: true,
      ...(filter.serviceId ? { serviceId: filter.serviceId } : {}),
    },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return { avg: result._avg.rating ?? 0, count: result._count._all };
}

/** Lists publishable reviews (APPROVED + consentPublic), most recently approved first, for the public Testimonials feed and Review JSON-LD. */
export async function listApprovedReviews(filter: { serviceId?: string; limit?: number } = {}): Promise<Review[]> {
  return prisma.review.findMany({
    where: {
      status: "APPROVED",
      consentPublic: true,
      ...(filter.serviceId ? { serviceId: filter.serviceId } : {}),
    },
    orderBy: { approvedAt: "desc" },
    take: filter.limit ?? 20,
  });
}

export interface PendingReviewWithRelations extends Review {
  clientProfile: { fullName: string } | null;
  service: { nameEn: string; nameAr: string } | null;
}

/** Lists reviews for the admin moderation view (submitted only -- rating>0/tokenUsedAt set -- newest-submitted first), optionally narrowed by status. Defaults to PENDING so the moderation queue is the default view. */
export async function listReviewsForModeration(
  filter: { status?: "PENDING" | "APPROVED" | "REJECTED" } = {},
): Promise<PendingReviewWithRelations[]> {
  return prisma.review.findMany({
    where: {
      tokenUsedAt: { not: null },
      status: filter.status ?? "PENDING",
    },
    include: {
      clientProfile: { select: { fullName: true } },
      service: { select: { nameEn: true, nameAr: true } },
    },
    orderBy: { tokenUsedAt: "desc" },
  });
}
