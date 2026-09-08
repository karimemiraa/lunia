import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";

function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

describe("crm/analytics models (post-seed)", () => {
  it("round-trips a VisitNote for a client, cascading on client delete", async () => {
    const clientUser = await prisma.user.create({
      data: {
        type: "CLIENT",
        email: `crm-test-client-${Date.now()}@example.com`,
        clientProfile: { create: { fullName: "CRM Test Client" } },
      },
      include: { clientProfile: true },
    });
    const clientProfileId = clientUser.clientProfile!.id;

    try {
      const note = await prisma.visitNote.create({
        data: {
          clientProfileId,
          authorUserId: clientUser.id,
          body: "Client mentioned sensitivity to retinol products.",
        },
      });

      const fetched = await prisma.visitNote.findUniqueOrThrow({ where: { id: note.id } });
      expect(fetched.clientProfileId).toBe(clientProfileId);
      expect(fetched.body).toBe("Client mentioned sensitivity to retinol products.");
      expect(fetched.bookingId).toBeNull();
      expect(fetched.createdAt).toBeInstanceOf(Date);
      expect(fetched.updatedAt).toBeInstanceOf(Date);

      const withRelation = await prisma.clientProfile.findUniqueOrThrow({
        where: { id: clientProfileId },
        include: { visitNotes: true },
      });
      expect(withRelation.visitNotes.length).toBe(1);
      expect(withRelation.visitNotes[0]?.id).toBe(note.id);
    } finally {
      // Deleting the user cascades to ClientProfile, which cascades to VisitNote.
      await prisma.user.delete({ where: { id: clientUser.id } });
    }

    const orphanNotes = await prisma.visitNote.findMany({ where: { clientProfileId } });
    expect(orphanNotes.length).toBe(0);
  });

  it("round-trips a PageView", async () => {
    const sessionId = `sess-${Date.now()}`;
    const view = await prisma.pageView.create({
      data: {
        path: "/en/book",
        locale: "en",
        referrerHost: "google.com",
        source: "google",
        sessionId,
      },
    });

    try {
      const fetched = await prisma.pageView.findUniqueOrThrow({ where: { id: view.id } });
      expect(fetched.path).toBe("/en/book");
      expect(fetched.sessionId).toBe(sessionId);
      expect(fetched.createdAt).toBeInstanceOf(Date);
    } finally {
      await prisma.pageView.delete({ where: { id: view.id } });
    }
  });

  it("round-trips an AnalyticsEvent with a Json meta field", async () => {
    const sessionId = `sess-${Date.now()}`;
    const event = await prisma.analyticsEvent.create({
      data: {
        name: "booking_started",
        path: "/en/book",
        sessionId,
        meta: { serviceSlug: "diagnostic-skin-analysis" },
      },
    });

    try {
      const fetched = await prisma.analyticsEvent.findUniqueOrThrow({ where: { id: event.id } });
      expect(fetched.name).toBe("booking_started");
      expect(fetched.meta).toEqual({ serviceSlug: "diagnostic-skin-analysis" });
    } finally {
      await prisma.analyticsEvent.delete({ where: { id: event.id } });
    }
  });

  it("has CampaignSpend rows seeded for the current period, unique by (channel, periodMonth)", async () => {
    const periodMonth = currentPeriodMonth();

    const instagram = await prisma.campaignSpend.findUniqueOrThrow({
      where: { channel_periodMonth: { channel: "instagram", periodMonth } },
    });
    expect(instagram.amountMinor).toBeGreaterThan(0);

    const google = await prisma.campaignSpend.findUniqueOrThrow({
      where: { channel_periodMonth: { channel: "google", periodMonth } },
    });
    expect(google.amountMinor).toBeGreaterThan(0);
  });
});
