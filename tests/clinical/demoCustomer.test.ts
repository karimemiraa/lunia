import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { DEMO_EMAIL, ensureDemoCustomer } from "@/modules/clinical/demoCustomer";
import { topClientsByLtv } from "@/modules/crm/ltv";

// The demo customer is meant to persist in dev databases, so this test leaves
// it in place (running the script/test again is exactly the idempotency case).
async function counts(clientProfileId: string) {
  const where = { clientProfileId };
  return {
    users: await prisma.user.count({ where: { email: DEMO_EMAIL } }),
    bookings: await prisma.booking.count({ where }),
    appointments: await prisma.appointment.count({ where: { booking: where } }),
    giftCards: await prisma.giftCard.count({ where: { issuedToClientId: clientProfileId } }),
    packages: await prisma.packagePurchase.count({ where }),
    demoPackages: await prisma.servicePackage.count({ where: { nameEn: "Demo package (test)" } }),
    intakes: await prisma.medicalIntake.count({ where }),
    signatures: await prisma.consentSignature.count({ where }),
    treatments: await prisma.treatmentRecord.count({ where }),
    loyalty: await prisma.loyaltyTransaction.count({ where }),
  };
}

describe("demo customer script", () => {
  it("is idempotent: running twice creates no duplicates", async () => {
    const first = await ensureDemoCustomer();
    const before = await counts(first.clientProfileId);
    const second = await ensureDemoCustomer();
    const after = await counts(second.clientProfileId);

    expect(second).toEqual(first);
    expect(after).toEqual(before);
    expect(after).toMatchObject({ users: 1, bookings: 2, appointments: 2, giftCards: 1, packages: 1, demoPackages: 1, signatures: 1, treatments: 1, loyalty: 1 });
    expect(after.intakes).toBeGreaterThanOrEqual(1);

    const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { id: first.clientProfileId }, include: { membership: true } });
    expect(profile.tags).toContain("test");
    expect(profile.membership).not.toBeNull();
    expect(profile.consentTreatmentAt).not.toBeNull();

    const upcoming = await prisma.appointment.findFirstOrThrow({ where: { bookingId: first.upcomingBookingId } });
    expect(upcoming.startAt.getTime()).toBeGreaterThan(Date.now());
  }, 60_000);

  it("keeps the test customer out of the LTV ranking", async () => {
    const { clientProfileId } = await ensureDemoCustomer();
    const top = await topClientsByLtv(1000);
    expect(top.some((t) => t.clientProfileId === clientProfileId)).toBe(false);
  }, 60_000);
});
