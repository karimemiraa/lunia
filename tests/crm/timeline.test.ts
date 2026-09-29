import { describe, it, expect } from "vitest";
import { assembleTimeline, pageTimeline, TIMELINE_KINDS, type TimelineEntry } from "@/modules/crm/timeline";

const d = (iso: string) => new Date(iso);
const cid = "client_1";

describe("crm/timeline assembleTimeline", () => {
  it("merges every source newest-first with a deep link per row", () => {
    const entries = assembleTimeline({
      clientProfileId: cid,
      bookings: [{ id: "b1", startAt: d("2026-09-10T08:00:00Z"), status: "COMPLETED", serviceName: "HydraFacial", staffName: "Sara", dateISO: "2026-09-10" }],
      invoices: [{ id: "i1", number: "INV-2026-000001", kind: "INVOICE", status: "ISSUED", totalMinor: 50000, paidMinor: 20000, issuedAt: d("2026-09-11T09:00:00Z"), createdAt: d("2026-09-11T08:00:00Z") }],
      payments: [{ id: "p1", invoiceId: "i1", invoiceNumber: "INV-2026-000001", amountMinor: 20000, method: "MADA", receivedAt: d("2026-09-11T09:05:00Z") }],
      packages: [{ id: "pk1", packageName: "Laser x6", sessionsRemaining: 5, sessionsTotal: 6, createdAt: d("2026-09-01T10:00:00Z"), redemptions: [{ id: "r1", createdAt: d("2026-09-10T08:30:00Z") }] }],
      giftCards: [{ id: "g1", code: "LUNIA-ABCD", initialMinor: 30000, balanceMinor: 10000, createdAt: d("2026-08-01T10:00:00Z"), redemptions: [{ id: "gr1", amountMinor: 20000, createdAt: d("2026-08-15T10:00:00Z") }] }],
      loyalty: [{ id: "l1", deltaPoints: 500, reason: "EARN", createdAt: d("2026-09-10T08:40:00Z") }],
      chats: [{ id: "c1", outcome: "BOOKED", createdAt: d("2026-08-30T10:00:00Z"), concerns: ["acne"] }],
      callbacks: [{ id: "cb1", status: "OPEN", outcome: null, topic: "Pricing", createdAt: d("2026-09-12T10:00:00Z"), handledAt: null }],
      whatsapp: [{ id: "w1", conversationId: "conv1", direction: "IN", body: "Hi, do you have a slot tomorrow?", createdAt: d("2026-09-12T11:00:00Z") }],
      inquiries: [{ id: "q1", message: "Interested in laser", handled: false, createdAt: d("2026-07-01T10:00:00Z") }],
      notes: [{ id: "n1", body: "Prefers mornings", authorName: "Dina", pinned: true, createdAt: d("2026-09-02T10:00:00Z") }],
      leadActivities: [{ id: "a1", kind: "CALL", outcome: "INTERESTED", body: null, authorName: "Dina", createdAt: d("2026-07-02T10:00:00Z") }],
      consents: [{ id: "s1", title: "General treatment consent", version: 2, signedAt: d("2026-09-09T10:00:00Z") }],
      treatments: [{ id: "t1", serviceName: "HydraFacial", performedByName: "Sara", performedAt: d("2026-09-10T08:45:00Z"), skinReaction: "mild redness" }],
      photos: [{ id: "ph1", kind: "BEFORE", area: "face", takenAt: d("2026-09-10T07:55:00Z") }],
      reviews: [{ id: "rv1", rating: 5, status: "APPROVED", createdAt: d("2026-09-13T10:00:00Z"), title: "Loved it" }],
      waitlist: [{ id: "wl1", serviceName: "Laser", desiredDateISO: "2026-09-20", status: "WAITING", createdAt: d("2026-09-14T10:00:00Z") }],
    });

    // Every kind is represented at least once.
    const kinds = new Set(entries.map((e) => e.kind));
    for (const k of TIMELINE_KINDS) expect(kinds.has(k), `kind ${k}`).toBe(true);

    // Sorted newest first.
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i - 1]!.at.getTime()).toBeGreaterThanOrEqual(entries[i]!.at.getTime());
    }
    expect(entries[0]!.kind).toBe("waitlist");

    // Ids are unique (package purchase + redemption share the purchase id but differ in suffix).
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);

    // Deep links.
    const byId = new Map(entries.map((e) => [e.id, e]));
    expect(byId.get("booking:b1")?.href).toBe("/admin/calendar?day=2026-09-10");
    expect(byId.get("booking:b1")?.detail).toBe("with Sara");
    expect(byId.get("invoice:i1")?.href).toBe("/admin/billing/i1");
    expect(byId.get("invoice:i1")?.detail).toContain("300 SAR outstanding");
    expect(byId.get("payment:p1")?.title).toBe("Payment 200 SAR");
    expect(byId.get("chat:c1")?.href).toBe("/admin/assistant/c1");
    expect(byId.get("whatsapp:w1")?.href).toBe("/admin/whatsapp?c=conv1");
    expect(byId.get("inquiry:q1")?.href).toBe("/admin/inquiries/q1");
    expect(byId.get("consent:s1")?.href).toBe(`/admin/clients/${cid}/clinical/consent/s1`);
    expect(byId.get("treatment:t1")?.href).toBe(`/admin/clients/${cid}/clinical/treatment/t1`);
    expect(byId.get("photo:ph1")?.photoId).toBe("ph1");
    expect(byId.get("package:pk1:r1")?.title).toContain("session used");
    expect(byId.get("giftcard:g1:gr1")?.detail).toBe("200 SAR");
    expect(byId.get("callback:cb1")?.status).toBe("OPEN");
  });

  it("marks refunds, drafts, credit notes and unsubmitted reviews", () => {
    const entries = assembleTimeline({
      clientProfileId: cid,
      invoices: [
        { id: "d1", number: "DRAFT", kind: "INVOICE", status: "DRAFT", totalMinor: 100, paidMinor: 0, issuedAt: null, createdAt: d("2026-09-01T00:00:00Z") },
        { id: "cn1", number: "CN-2026-000001", kind: "CREDIT_NOTE", status: "ISSUED", totalMinor: 5000, paidMinor: 0, issuedAt: d("2026-09-02T00:00:00Z"), createdAt: d("2026-09-02T00:00:00Z") },
      ],
      payments: [{ id: "p1", invoiceId: null, amountMinor: -5000, method: "CASH", receivedAt: d("2026-09-03T00:00:00Z") }],
      reviews: [{ id: "rv1", rating: 0, status: "PENDING", createdAt: d("2026-09-04T00:00:00Z") }],
    });
    const byId = new Map(entries.map((e) => [e.id, e]));
    expect(byId.get("invoice:d1")?.title).toBe("Draft invoice");
    expect(byId.get("invoice:cn1")?.title).toBe("Credit note CN-2026-000001");
    expect(byId.get("invoice:cn1")?.detail).toBe("−50 SAR");
    expect(byId.get("payment:p1")?.title).toBe("Refund 50 SAR");
    expect(byId.get("payment:p1")?.href).toBeUndefined();
    expect(byId.get("review:rv1")?.title).toBe("Review requested");
    expect(byId.get("review:rv1")?.status).toBe("AWAITING");
  });

  it("returns an empty feed for a customer with no history", () => {
    expect(assembleTimeline({ clientProfileId: cid })).toEqual([]);
  });

  it("truncates long note bodies", () => {
    const [n] = assembleTimeline({ clientProfileId: cid, notes: [{ id: "n", body: "x".repeat(400), pinned: false, createdAt: d("2026-01-01T00:00:00Z") }] });
    expect(n!.detail!.length).toBeLessThanOrEqual(110);
    expect(n!.detail!.endsWith("…")).toBe(true);
  });
});

describe("crm/timeline pageTimeline", () => {
  const entries: TimelineEntry[] = Array.from({ length: 12 }, (_, i) => ({
    id: `e${i}`,
    kind: i % 3 === 0 ? "booking" : i % 3 === 1 ? "note" : "loyalty",
    at: new Date(2026, 0, 12 - i),
    title: `Entry ${i}`,
  }));

  it("paginates 1-based with hasMore", () => {
    const p1 = pageTimeline(entries, { page: 1, pageSize: 5 });
    expect(p1.entries.map((e) => e.id)).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    expect(p1.total).toBe(12);
    expect(p1.hasMore).toBe(true);
    const p3 = pageTimeline(entries, { page: 3, pageSize: 5 });
    expect(p3.entries.map((e) => e.id)).toEqual(["e10", "e11"]);
    expect(p3.hasMore).toBe(false);
  });

  it("filters by kinds before paginating", () => {
    const p = pageTimeline(entries, { kinds: ["note"], pageSize: 10 });
    expect(p.total).toBe(4);
    expect(p.entries.every((e) => e.kind === "note")).toBe(true);
  });

  it("clamps page below 1 and empty kinds means all", () => {
    const p = pageTimeline(entries, { page: 0, kinds: [] });
    expect(p.page).toBe(1);
    expect(p.total).toBe(12);
  });
});
