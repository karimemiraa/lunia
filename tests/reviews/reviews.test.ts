import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { complete } from "@/modules/booking/bookings";
import {
  scheduleReviewRequest,
  submitReview,
  approveReview,
  rejectReview,
  getAggregate,
  listApprovedReviews,
  REVIEW_DELAY_DAYS,
} from "@/modules/reviews/reviews";

// This suite is the first to exercise getAggregate/listApprovedReviews,
// which are GLOBAL reads (optionally scoped by serviceId) rather than
// scoped to a phone-prefixed client tree the way every other suite's checks
// are. Reusing one of the app's real seeded services for the aggregate
// assertions would risk cross-contamination from another suite/manual QA
// review against that same service, in this persistent shared dev DB. So
// this suite creates its OWN throwaway Department/Service (fixed slugs, so
// repeated runs upsert/reuse and clean up after themselves) and scopes every
// aggregate assertion to that service's id -- nothing else in the DB can
// ever write a Review against it.
const TEST_DEPT_SLUG = "test-reviews-department";
const TEST_SERVICE_SLUG = "test-reviews-service";

const PHONE_PREFIX = "+9665TESTREVIEWS";
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

let testServiceId: string;

// Tracked explicitly (not just found by phone prefix) because one test
// below deliberately nulls out a client's phone to exercise the
// no-reachable-recipient path -- after that, the row would no longer match
// a phone-prefix sweep at all and would leak permanently.
const createdUserIds: string[] = [];

async function sweep() {
  // Review isn't cascade-deleted by Booking/ClientProfile (both relations
  // are onDelete: SetNull, by design -- an orphaned review can still be
  // audited), so it must be swept explicitly. Scoping by our own throwaway
  // serviceId is sufficient since every review this suite ever creates is
  // for a booking against that service.
  if (testServiceId) {
    await prisma.review.deleteMany({ where: { serviceId: testServiceId } });
  }
  await prisma.scheduledMessage.deleteMany({ where: { toPhone: { startsWith: PHONE_PREFIX } } });
  // Cascades ClientProfile -> Booking -> Appointment.
  await prisma.user.deleteMany({
    where: { OR: [{ phone: { startsWith: PHONE_PREFIX } }, { id: { in: createdUserIds } }] },
  });
}

beforeAll(async () => {
  const department = await prisma.department.upsert({
    where: { slug: TEST_DEPT_SLUG },
    update: {},
    create: {
      slug: TEST_DEPT_SLUG,
      nameEn: "Test Reviews Department",
      nameAr: "قسم اختبار التقييمات",
      taglineEn: "test",
      taglineAr: "اختبار",
      descEn: "test",
      descAr: "اختبار",
      isPublished: false,
    },
  });
  const service = await prisma.service.upsert({
    where: { slug: TEST_SERVICE_SLUG },
    update: {},
    create: {
      slug: TEST_SERVICE_SLUG,
      departmentId: department.id,
      nameEn: "Test Reviews Service",
      nameAr: "خدمة اختبار التقييمات",
      summaryEn: "test",
      summaryAr: "اختبار",
      benefitsEn: [],
      benefitsAr: [],
      isPublished: false,
    },
  });
  testServiceId = service.id;
  // Clean up any leftover rows from a prior crashed run of this same suite
  // (which would have reused this same service id via the upsert above)
  // before any test runs.
  await sweep();
});

afterAll(async () => {
  await sweep();
  await prisma.service.delete({ where: { id: testServiceId } }).catch(() => {});
  await prisma.department.delete({ where: { slug: TEST_DEPT_SLUG } }).catch(() => {});
});

async function makeClient(name: string, contact: { phone?: string; email?: string } = {}): Promise<string> {
  const user = await prisma.user.create({
    data: {
      type: "CLIENT",
      phone: contact.phone ?? freshPhone(),
      email: contact.email,
      clientProfile: { create: { fullName: name } },
    },
    include: { clientProfile: true },
  });
  createdUserIds.push(user.id);
  return user.clientProfile!.id;
}

// Creates a Booking + single Appointment directly against this suite's
// throwaway service (bypassing availability/slot logic, which reviews.ts
// doesn't touch), mirroring tests/crm/loyalty.test.ts's makeBookingWithPrice.
async function makeBooking(clientProfileId: string, status: "CONFIRMED" | "COMPLETED" = "CONFIRMED") {
  const staff = await prisma.user.findFirstOrThrow({ where: { type: "STAFF" } });
  const room = await prisma.room.findFirstOrThrow({ where: { isActive: true } });
  const startAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 500);
  const endAt = new Date(startAt.getTime() + 60 * 60_000);

  return prisma.booking.create({
    data: {
      clientProfileId,
      status,
      channel: "FRONT_DESK",
      appointments: {
        create: {
          serviceId: testServiceId,
          staffUserId: staff.id,
          roomId: room.id,
          startAt,
          endAt,
          priceMinorSnapshot: 10_000,
        },
      },
    },
    include: { appointments: true },
  });
}

describe("scheduleReviewRequest", () => {
  it("creates a PENDING Review row and schedules a REVIEW_REQUEST message at completedAt + REVIEW_DELAY_DAYS", async () => {
    const clientProfileId = await makeClient("Review Request Client");
    const booking = await makeBooking(clientProfileId);
    const completedAt = new Date();

    const review = await scheduleReviewRequest(booking, { completedAt });

    expect(review.status).toBe("PENDING");
    expect(review.bookingId).toBe(booking.id);
    expect(review.serviceId).toBe(testServiceId);
    expect(review.tokenUsedAt).toBeNull();
    expect(review.token.length).toBeGreaterThan(20);

    const messages = await prisma.scheduledMessage.findMany({ where: { kind: "REVIEW_REQUEST", bookingId: booking.id } });
    expect(messages.length).toBe(1);
    const message = messages[0]!;
    expect(message.status).toBe("PENDING");
    expect(message.clientProfileId).toBe(clientProfileId);
    expect(message.sendAt.getTime()).toBe(completedAt.getTime() + REVIEW_DELAY_DAYS * 86_400_000);

    const payload = message.payload as Record<string, unknown>;
    expect(String(payload.link)).toContain(`/review/${review.token}`);
  });

  it("is idempotent: a second call for the same booking returns the existing review and does not schedule a second message", async () => {
    const clientProfileId = await makeClient("Review Idempotency Client");
    const booking = await makeBooking(clientProfileId);

    const first = await scheduleReviewRequest(booking, { completedAt: new Date() });
    const second = await scheduleReviewRequest(booking, { completedAt: new Date() });

    expect(second.id).toBe(first.id);
    expect(second.token).toBe(first.token);

    const messages = await prisma.scheduledMessage.findMany({ where: { kind: "REVIEW_REQUEST", bookingId: booking.id } });
    expect(messages.length).toBe(1);
  });

  it("still creates the Review row (with a usable token) when the client has no phone/email, but schedules no message", async () => {
    const clientProfileId = await makeClient("No Contact Client");
    // Blank out the only contact info the User row was created with, so
    // scheduleReviewRequest's recipient lookup finds neither.
    const client = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientProfileId } });
    await prisma.user.update({ where: { id: client.userId }, data: { phone: null } });

    const booking = await makeBooking(clientProfileId);
    const review = await scheduleReviewRequest(booking, { completedAt: new Date() });

    expect(review.token).toBeTruthy();
    const messages = await prisma.scheduledMessage.findMany({ where: { kind: "REVIEW_REQUEST", bookingId: booking.id } });
    expect(messages.length).toBe(0);
  });

  it("complete() schedules a review request as a best-effort side effect", async () => {
    const clientProfileId = await makeClient("Complete Hook Client");
    const booking = await makeBooking(clientProfileId, "CONFIRMED");

    const completed = await complete(booking.id);
    expect(completed.status).toBe("COMPLETED");

    const review = await prisma.review.findUnique({ where: { bookingId: booking.id } });
    expect(review).not.toBeNull();
    expect(review?.status).toBe("PENDING");

    const messages = await prisma.scheduledMessage.findMany({ where: { kind: "REVIEW_REQUEST", bookingId: booking.id } });
    expect(messages.length).toBe(1);
  });
});

describe("submitReview", () => {
  it("accepts a valid single submission and stamps tokenUsedAt, staying PENDING", async () => {
    const clientProfileId = await makeClient("Submit Client");
    const booking = await makeBooking(clientProfileId);
    const review = await scheduleReviewRequest(booking, { completedAt: new Date() });

    const submitted = await submitReview(review.token, {
      rating: 5,
      title: "Wonderful",
      body: "Loved every minute.",
      authorDisplayName: "Sara A.",
      consentPublic: true,
    });

    expect(submitted.rating).toBe(5);
    expect(submitted.title).toBe("Wonderful");
    expect(submitted.consentPublic).toBe(true);
    expect(submitted.status).toBe("PENDING");
    expect(submitted.tokenUsedAt).not.toBeNull();
  });

  it("rejects a second submit against an already-used token", async () => {
    const clientProfileId = await makeClient("Double Submit Client");
    const booking = await makeBooking(clientProfileId);
    const review = await scheduleReviewRequest(booking, { completedAt: new Date() });

    await submitReview(review.token, { rating: 4, consentPublic: false });

    await expect(submitReview(review.token, { rating: 1, consentPublic: false })).rejects.toThrow(
      /already been submitted/,
    );
  });

  it("rejects an unknown token", async () => {
    await expect(submitReview("does-not-exist-token", { rating: 5, consentPublic: false })).rejects.toThrow(
      /Invalid review link/,
    );
  });

  it("rejects a rating outside 1..5", async () => {
    const clientProfileId = await makeClient("Rating Validation Client");
    const booking = await makeBooking(clientProfileId);
    const review = await scheduleReviewRequest(booking, { completedAt: new Date() });

    await expect(submitReview(review.token, { rating: 0, consentPublic: false })).rejects.toThrow();
    await expect(submitReview(review.token, { rating: 6, consentPublic: false })).rejects.toThrow();

    // Confirm the invalid attempts never consumed the token.
    const untouched = await prisma.review.findUniqueOrThrow({ where: { token: review.token } });
    expect(untouched.tokenUsedAt).toBeNull();
  });
});

describe("approveReview / rejectReview / getAggregate / listApprovedReviews", () => {
  it("refuses to approve a review that was never submitted", async () => {
    const clientProfileId = await makeClient("Unsubmitted Client");
    const booking = await makeBooking(clientProfileId);
    const review = await scheduleReviewRequest(booking, { completedAt: new Date() });

    await expect(approveReview(review.id)).rejects.toThrow(/not been submitted/);
  });

  it("an APPROVED + consentPublic review appears in the aggregate/list; PENDING and REJECTED do not", async () => {
    // Baseline: this suite's dedicated service has had no APPROVED reviews
    // yet at this point in the file (earlier tests above only reach PENDING).
    const before = await getAggregate({ serviceId: testServiceId });
    expect(before.count).toBe(0);

    const approvedClient = await makeClient("Approved Reviewer");
    const approvedBooking = await makeBooking(approvedClient);
    const approvedReview = await scheduleReviewRequest(approvedBooking, { completedAt: new Date() });
    await submitReview(approvedReview.token, { rating: 5, body: "Excellent visit.", consentPublic: true });
    await approveReview(approvedReview.id);

    const pendingClient = await makeClient("Pending Reviewer");
    const pendingBooking = await makeBooking(pendingClient);
    const pendingReview = await scheduleReviewRequest(pendingBooking, { completedAt: new Date() });
    await submitReview(pendingReview.token, { rating: 2, body: "Still pending.", consentPublic: true });
    // left PENDING (no approve/reject call)

    const rejectedClient = await makeClient("Rejected Reviewer");
    const rejectedBooking = await makeBooking(rejectedClient);
    const rejectedReview = await scheduleReviewRequest(rejectedBooking, { completedAt: new Date() });
    await submitReview(rejectedReview.token, { rating: 1, body: "Rejected content.", consentPublic: true });
    await rejectReview(rejectedReview.id);

    const privateClient = await makeClient("Private Approved Reviewer");
    const privateBooking = await makeBooking(privateClient);
    const privateReview = await scheduleReviewRequest(privateBooking, { completedAt: new Date() });
    await submitReview(privateReview.token, { rating: 3, body: "Approved but not public.", consentPublic: false });
    await approveReview(privateReview.id);

    const aggregate = await getAggregate({ serviceId: testServiceId });
    expect(aggregate.count).toBe(1);
    expect(aggregate.avg).toBe(5);

    const list = await listApprovedReviews({ serviceId: testServiceId });
    expect(list.map((r) => r.id)).toEqual([approvedReview.id]);
    expect(list[0]!.body).toBe("Excellent visit.");
  });
});
