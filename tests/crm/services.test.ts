import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import type { Room, Service, User } from "@prisma/client";
import { complete } from "@/modules/booking/bookings";
import { listClients, getClientDetail, updateClientTier } from "@/modules/crm/clients";
import { addVisitNote, listVisitNotes, deleteVisitNote } from "@/modules/crm/visitNotes";
import { computeClientLtvMinor, refreshClientLtv, topClientsByLtv } from "@/modules/crm/ltv";
import { listCampaignSpend, upsertCampaignSpend, spendByChannel } from "@/modules/crm/campaigns";

// Every User this suite creates carries this email prefix so cleanup can find
// (and remove) everything regardless of which test created it or whether an
// assertion failed partway through.
const EMAIL_PREFIX = "crm-services-test-";
let emailCounter = 0;
function freshEmail(): string {
  emailCounter += 1;
  return `${EMAIL_PREFIX}${Date.now()}-${emailCounter}@example.com`;
}

let service: Service;
let owner: User;
let testRoom: Room;

async function sweepTestData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    include: { clientProfile: true },
  });
  const clientProfileIds = users.map((u) => u.clientProfile?.id).filter((id): id is string => !!id);
  if (clientProfileIds.length > 0) {
    const bookings = await prisma.booking.findMany({ where: { clientProfileId: { in: clientProfileIds } } });
    const bookingIds = bookings.map((b) => b.id);
    if (bookingIds.length > 0) {
      await prisma.appointment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.checkIn.deleteMany({ where: { bookingId: { in: bookingIds } } });
    }
    await prisma.booking.deleteMany({ where: { clientProfileId: { in: clientProfileIds } } });
    await prisma.visitNote.deleteMany({ where: { clientProfileId: { in: clientProfileIds } } });
    await prisma.clientMembership.deleteMany({ where: { clientId: { in: clientProfileIds } } });
  }
  // Deleting the User cascades to ClientProfile.
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  await prisma.room.deleteMany({ where: { name: "CRM Test Room" } });
  await prisma.campaignSpend.deleteMany({ where: { channel: { startsWith: "crm-test-channel-" } } });
}

beforeAll(async () => {
  await sweepTestData();
  service = await prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });
  owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@lunia.local" } });
  testRoom = await prisma.room.create({ data: { name: "CRM Test Room", capacity: 1, order: 999 } });
});

afterAll(async () => {
  await sweepTestData();
});

async function createTestClient(fullName: string, sourceChannel?: string) {
  const user = await prisma.user.create({
    data: {
      type: "CLIENT",
      email: freshEmail(),
      phone: `+9665${Date.now()}${Math.floor(Math.random() * 100000)}`,
      clientProfile: { create: { fullName, sourceChannel: sourceChannel ?? null } },
    },
    include: { clientProfile: true },
  });
  return { user, clientProfileId: user.clientProfile!.id };
}

async function createRawBooking(clientProfileId: string, status: "CONFIRMED" | "COMPLETED", priceMinor: number, startAt: Date) {
  return prisma.booking.create({
    data: {
      clientProfileId,
      status,
      appointments: {
        create: {
          serviceId: service.id,
          staffUserId: owner.id,
          roomId: testRoom.id,
          startAt,
          endAt: new Date(startAt.getTime() + service.durationMin * 60_000),
          priceMinorSnapshot: priceMinor,
        },
      },
    },
    include: { appointments: true },
  });
}

describe("ltv", () => {
  it("computeClientLtvMinor sums only COMPLETED bookings' appointment prices", async () => {
    const { clientProfileId } = await createTestClient("LTV Test Client");

    await createRawBooking(clientProfileId, "COMPLETED", 10_000, new Date("2026-01-05T10:00:00.000Z"));
    await createRawBooking(clientProfileId, "CONFIRMED", 99_999, new Date("2026-02-05T10:00:00.000Z"));

    const ltv = await computeClientLtvMinor(clientProfileId);
    expect(ltv).toBe(10_000);
  });

  it("refreshClientLtv updates ClientProfile.ltvCacheMinor and returns the value", async () => {
    const { clientProfileId } = await createTestClient("Refresh LTV Client");
    await createRawBooking(clientProfileId, "COMPLETED", 25_000, new Date("2026-01-06T10:00:00.000Z"));

    const before = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientProfileId } });
    expect(before.ltvCacheMinor).toBe(0);

    const returned = await refreshClientLtv(clientProfileId);
    expect(returned).toBe(25_000);

    const after = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientProfileId } });
    expect(after.ltvCacheMinor).toBe(25_000);
  });

  it("completing a booking via bookings.complete() refreshes that client's LTV", async () => {
    const { clientProfileId } = await createTestClient("Complete Wires LTV Client");
    const booking = await createRawBooking(clientProfileId, "CONFIRMED", 42_000, new Date("2026-01-07T10:00:00.000Z"));

    const before = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientProfileId } });
    expect(before.ltvCacheMinor).toBe(0);

    const completed = await complete(booking.id);
    expect(completed.status).toBe("COMPLETED");

    const after = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientProfileId } });
    expect(after.ltvCacheMinor).toBe(42_000);
  });

  it("topClientsByLtv returns clients ordered by ltvCacheMinor descending", async () => {
    const low = await createTestClient("Top LTV Low");
    const high = await createTestClient("Top LTV High");
    await createRawBooking(low.clientProfileId, "COMPLETED", 1_000, new Date("2026-01-01T10:00:00.000Z"));
    await createRawBooking(high.clientProfileId, "COMPLETED", 500_000, new Date("2026-01-01T10:00:00.000Z"));
    await refreshClientLtv(low.clientProfileId);
    await refreshClientLtv(high.clientProfileId);

    const top = await topClientsByLtv(5);
    const highIndex = top.findIndex((t) => t.clientProfileId === high.clientProfileId);
    const lowIndex = top.findIndex((t) => t.clientProfileId === low.clientProfileId);
    expect(highIndex).toBeGreaterThanOrEqual(0);
    expect(lowIndex).toBeGreaterThanOrEqual(0);
    expect(highIndex).toBeLessThan(lowIndex);
  });
});

describe("visitNotes", () => {
  it("addVisitNote validates a non-empty body and caps length", async () => {
    const { clientProfileId } = await createTestClient("Visit Note Client");
    await expect(
      addVisitNote({ clientProfileId, authorUserId: owner.id, body: "" }),
    ).rejects.toThrow();
    await expect(
      addVisitNote({ clientProfileId, authorUserId: owner.id, body: "x".repeat(20_000) }),
    ).rejects.toThrow();
  });

  it("addVisitNote + listVisitNotes resolves authorName, newest first", async () => {
    const { clientProfileId } = await createTestClient("Visit Note List Client");

    const first = await addVisitNote({ clientProfileId, authorUserId: owner.id, body: "First note" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await addVisitNote({ clientProfileId, authorUserId: owner.id, body: "Second note" });

    const notes = await listVisitNotes(clientProfileId);
    expect(notes.length).toBe(2);
    expect(notes[0]!.id).toBe(second.id);
    expect(notes[1]!.id).toBe(first.id);
    expect(notes[0]!.authorName).toBeTruthy();
  });

  it("deleteVisitNote allows the author to delete their own note", async () => {
    const { clientProfileId } = await createTestClient("Visit Note Delete Client");
    const note = await addVisitNote({ clientProfileId, authorUserId: owner.id, body: "Delete me" });

    await deleteVisitNote(note.id, owner.id);

    const gone = await prisma.visitNote.findUnique({ where: { id: note.id } });
    expect(gone).toBeNull();
  });

  it("deleteVisitNote rejects a non-author", async () => {
    const { clientProfileId, user: clientUser } = await createTestClient("Visit Note Guard Client");
    const note = await addVisitNote({ clientProfileId, authorUserId: owner.id, body: "Protected note" });

    await expect(deleteVisitNote(note.id, clientUser.id)).rejects.toThrow();

    const stillThere = await prisma.visitNote.findUnique({ where: { id: note.id } });
    expect(stillThere).not.toBeNull();
  });
});

describe("clients", () => {
  it("updateClientTier sets and then removes a membership", async () => {
    const { clientProfileId } = await createTestClient("Tier Client");
    const vipTier = await prisma.membershipTier.findUniqueOrThrow({ where: { key: "vip" } });

    await updateClientTier(clientProfileId, vipTier.id);
    const membership = await prisma.clientMembership.findUnique({ where: { clientId: clientProfileId } });
    expect(membership?.tierId).toBe(vipTier.id);

    await updateClientTier(clientProfileId, null);
    const removed = await prisma.clientMembership.findUnique({ where: { clientId: clientProfileId } });
    expect(removed).toBeNull();
  });

  it("listClients finds a client by name and by phone, and reports LTV", async () => {
    const uniqueName = `Findable Client ${Date.now()}`;
    const { clientProfileId, user } = await createTestClient(uniqueName, "instagram");
    await createRawBooking(clientProfileId, "COMPLETED", 7_500, new Date("2026-01-08T10:00:00.000Z"));
    await refreshClientLtv(clientProfileId);

    const byName = await listClients({ search: uniqueName });
    expect(byName.length).toBe(1);
    expect(byName[0]!.clientProfileId).toBe(clientProfileId);
    expect(byName[0]!.ltvMinor).toBe(7_500);
    expect(byName[0]!.bookingCount).toBe(1);
    expect(byName[0]!.lastVisitAt).toBeInstanceOf(Date);

    const byPhone = await listClients({ search: user.phone! });
    expect(byPhone.some((c) => c.clientProfileId === clientProfileId)).toBe(true);

    const bySource = await listClients({ source: "instagram", search: uniqueName });
    expect(bySource.some((c) => c.clientProfileId === clientProfileId)).toBe(true);
  });

  it("listClients filters by tierKey", async () => {
    const { clientProfileId } = await createTestClient(`Tier Filter Client ${Date.now()}`);
    const vipTier = await prisma.membershipTier.findUniqueOrThrow({ where: { key: "vip" } });
    await updateClientTier(clientProfileId, vipTier.id);

    const vipClients = await listClients({ tierKey: "vip" });
    expect(vipClients.some((c) => c.clientProfileId === clientProfileId)).toBe(true);
    for (const c of vipClients) {
      expect(c.tierName).toBe("VIP");
    }
  });

  it("getClientDetail returns profile, tier, ltv, and bookings with service/date/status", async () => {
    const { clientProfileId } = await createTestClient("Detail Client");
    const vipTier = await prisma.membershipTier.findUniqueOrThrow({ where: { key: "vip" } });
    await updateClientTier(clientProfileId, vipTier.id);
    await createRawBooking(clientProfileId, "COMPLETED", 12_000, new Date("2026-01-09T10:00:00.000Z"));
    await refreshClientLtv(clientProfileId);

    const detail = await getClientDetail(clientProfileId);
    expect(detail).not.toBeNull();
    expect(detail!.profile.id).toBe(clientProfileId);
    expect(detail!.tier?.key).toBe("vip");
    expect(detail!.ltvMinor).toBe(12_000);
    expect(detail!.bookings.length).toBe(1);
    expect(detail!.bookings[0]!.status).toBe("COMPLETED");
    expect(detail!.bookings[0]!.serviceName).toBe(service.nameEn);
    expect(detail!.bookings[0]!.startAt).toBeInstanceOf(Date);
  });

  it("getClientDetail returns null for an unknown client", async () => {
    const detail = await getClientDetail("nonexistent-client-id");
    expect(detail).toBeNull();
  });
});

describe("campaigns", () => {
  const CHANNEL_A = `crm-test-channel-a-${Date.now()}`;
  const CHANNEL_B = `crm-test-channel-b-${Date.now()}`;

  it("upsertCampaignSpend creates then updates by (channel, periodMonth)", async () => {
    const created = await upsertCampaignSpend({ channel: CHANNEL_A, periodMonth: "2026-01", amountMinor: 10_000 });
    expect(created.amountMinor).toBe(10_000);

    const updated = await upsertCampaignSpend({ channel: CHANNEL_A, periodMonth: "2026-01", amountMinor: 15_000, note: "boosted" });
    expect(updated.id).toBe(created.id);
    expect(updated.amountMinor).toBe(15_000);
    expect(updated.note).toBe("boosted");

    const all = await prisma.campaignSpend.findMany({ where: { channel: CHANNEL_A } });
    expect(all.length).toBe(1);
  });

  it("upsertCampaignSpend rejects a negative amount or malformed periodMonth", async () => {
    await expect(upsertCampaignSpend({ channel: CHANNEL_A, periodMonth: "2026-01", amountMinor: -1 })).rejects.toThrow();
    await expect(upsertCampaignSpend({ channel: CHANNEL_A, periodMonth: "2026-1", amountMinor: 100 })).rejects.toThrow();
  });

  it("listCampaignSpend filters by month range and spendByChannel sums per channel", async () => {
    await upsertCampaignSpend({ channel: CHANNEL_A, periodMonth: "2026-02", amountMinor: 20_000 });
    await upsertCampaignSpend({ channel: CHANNEL_B, periodMonth: "2026-02", amountMinor: 5_000 });
    await upsertCampaignSpend({ channel: CHANNEL_A, periodMonth: "2026-05", amountMinor: 999_000 }); // out of range below

    const inRange = await listCampaignSpend({ from: new Date("2026-01-01"), to: new Date("2026-03-01") });
    const channels = inRange.filter((r) => r.channel === CHANNEL_A || r.channel === CHANNEL_B);
    // CHANNEL_A: 2026-01 (15_000, updated above) + 2026-02 (20_000); CHANNEL_B: 2026-02 (5_000)
    expect(channels.length).toBe(3);
    expect(channels.some((r) => r.periodMonth === "2026-05")).toBe(false);

    const byChannel = await spendByChannel({ from: new Date("2026-01-01"), to: new Date("2026-03-01") });
    const a = byChannel.find((c) => c.channel === CHANNEL_A);
    const b = byChannel.find((c) => c.channel === CHANNEL_B);
    expect(a?.amountMinor).toBe(35_000);
    expect(b?.amountMinor).toBe(5_000);
  });
});
