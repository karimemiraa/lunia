import { prisma } from "@/lib/db";

// Every user this suite creates carries this email prefix so cleanup can
// sweep leftovers from a crashed earlier run too.
export const HR_TEST_PREFIX = "hr-test-";

export async function createStaff(label: string): Promise<string> {
  const email = `${HR_TEST_PREFIX}${label}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await prisma.user.create({
    data: { type: "STAFF", email, staffProfile: { create: { fullName: `HR Test ${label}` } } },
  });
  return user.id;
}

export async function cleanupHrTestData(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: HR_TEST_PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  // Appointments reference staff without cascade: remove their bookings first.
  const appts = await prisma.appointment.findMany({ where: { staffUserId: { in: ids } }, select: { bookingId: true } });
  await prisma.booking.deleteMany({ where: { id: { in: appts.map((a) => a.bookingId) } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
