import { describe, it, expect } from "vitest";
import { nextBestActions, REBOOK_AFTER_DAYS, type NextBestActionInput } from "@/modules/crm/nextBestAction";

const now = new Date("2026-09-28T09:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

function base(over: Partial<NextBestActionInput> = {}): NextBestActionInput {
  return {
    clientProfileId: "c1",
    now,
    lastVisitAt: daysAgo(10),
    nextAppointmentAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
    packageSessionsRemaining: 0,
    unpaidInvoices: [],
    missingConsents: [],
    openCallbacks: 0,
    nextFollowUpAt: null,
    fullName: "Noura Al Saud",
    phone: "+966500000000",
    ...over,
  };
}

describe("crm/nextBestActions", () => {
  it("returns nothing for a healthy, booked, paid-up customer", () => {
    expect(nextBestActions(base())).toEqual([]);
  });

  it("suggests rebooking when lapsed with nothing scheduled", () => {
    const actions = nextBestActions(base({ nextAppointmentAt: null, lastVisitAt: daysAgo(REBOOK_AFTER_DAYS + 1) }));
    expect(actions.map((a) => a.key)).toEqual(["rebook"]);
    expect(actions[0]!.href).toContain("/admin/calendar?name=Noura");
    expect(actions[0]!.href).toContain("phone=%2B966500000000");
  });

  it("does not suggest rebooking inside the window or when an appointment is upcoming", () => {
    expect(nextBestActions(base({ nextAppointmentAt: null, lastVisitAt: daysAgo(REBOOK_AFTER_DAYS) }))).toEqual([]);
    expect(nextBestActions(base({ lastVisitAt: daysAgo(200) }))).toEqual([]);
  });

  it("prefers 'book next package session' over plain rebooking", () => {
    const actions = nextBestActions(base({ nextAppointmentAt: null, lastVisitAt: daysAgo(90), packageSessionsRemaining: 3 }));
    expect(actions.map((a) => a.key)).toEqual(["package"]);
    expect(actions[0]!.reason).toContain("3 prepaid sessions");
  });

  it("suggests a first consultation for someone who never visited", () => {
    const actions = nextBestActions(base({ nextAppointmentAt: null, lastVisitAt: null }));
    expect(actions.map((a) => a.key)).toEqual(["first-visit"]);
  });

  it("flags unpaid invoices, missing consents and open call-backs as high priority, ordered first", () => {
    const actions = nextBestActions(
      base({
        nextAppointmentAt: null,
        lastVisitAt: daysAgo(100),
        unpaidInvoices: [{ id: "i1", number: "INV-2026-000009", outstandingMinor: 12500 }],
        missingConsents: [
          { formId: "f1", title: "Laser consent", bookingIds: ["b1"] },
          { formId: "f2", title: "Photography", bookingIds: [] },
        ],
        openCallbacks: 2,
      }),
    );
    expect(actions.map((a) => a.key)).toEqual(["pay:i1", "consent:f1", "callback", "rebook"]);
    expect(actions[0]!.reason).toContain("125 SAR");
    expect(actions[0]!.href).toBe("/admin/billing/i1");
    expect(actions[1]!.href).toBe("/admin/clients/c1/clinical/sign/f1");
    expect(actions[2]!.title).toContain("2 open");
    expect(actions.every((a, i) => i === 3 || a.priority === "high")).toBe(true);
  });

  it("flags an overdue follow-up", () => {
    const actions = nextBestActions(base({ nextFollowUpAt: daysAgo(2) }));
    expect(actions.map((a) => a.key)).toEqual(["followup"]);
    expect(actions[0]!.reason).toBe("Overdue by 2 days.");
    expect(nextBestActions(base({ nextFollowUpAt: new Date(now.getTime() + 1000) }))).toEqual([]);
  });

  it("asks for a review only after a recent visit", () => {
    expect(nextBestActions(base({ reviewableVisits: 1, lastVisitAt: daysAgo(5) })).map((a) => a.key)).toEqual(["review"]);
    expect(nextBestActions(base({ reviewableVisits: 1, lastVisitAt: daysAgo(40) }))).toEqual([]);
  });
});
