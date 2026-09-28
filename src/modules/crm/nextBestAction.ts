// "Next best action" for a customer profile: a handful of plain rules over
// facts the 360 page already has, producing an ordered list of suggestions
// with a deep link each. Pure (no DB) so the rules are unit-testable; the
// page gathers the facts. Highest-priority first. There is no birthday
// field on ClientProfile, so no birthday rule.

export interface NextBestActionInput {
  clientProfileId: string;
  now: Date;
  lastVisitAt: Date | null;
  nextAppointmentAt: Date | null;
  /** Total remaining sessions across active packages. */
  packageSessionsRemaining: number;
  /** Issued-but-unpaid invoices (ISSUED / PARTIALLY_PAID). */
  unpaidInvoices: { id: string; number: string; outstandingMinor: number }[];
  /** Required consents not signed at the current version, with the upcoming booking ids they gate. */
  missingConsents: { formId: string; title: string; bookingIds: string[] }[];
  openCallbacks: number;
  nextFollowUpAt: Date | null;
  /** Completed visits with no review row yet (rating 0 counts as "requested", so only count bookings lacking a Review). */
  reviewableVisits?: number;
  /** Prefill for the booking link. */
  fullName: string;
  phone: string | null;
}

export type ActionPriority = "high" | "medium" | "low";

export interface NextBestAction {
  key: string;
  priority: ActionPriority;
  title: string;
  reason: string;
  href: string;
  cta: string;
}

export const REBOOK_AFTER_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

const money = (minor: number) => `${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} SAR`;

function bookHref(input: NextBestActionInput): string {
  const sp = new URLSearchParams({ name: input.fullName });
  if (input.phone) sp.set("phone", input.phone);
  return `/admin/calendar?${sp.toString()}`;
}

export function nextBestActions(input: NextBestActionInput): NextBestAction[] {
  const out: NextBestAction[] = [];
  const hasUpcoming = !!input.nextAppointmentAt && input.nextAppointmentAt > input.now;

  // Money first: an unpaid invoice is the most concrete thing to act on.
  for (const inv of input.unpaidInvoices) {
    out.push({
      key: `pay:${inv.id}`,
      priority: "high",
      title: "Send a pay link",
      reason: `${inv.number} has ${money(inv.outstandingMinor)} outstanding.`,
      href: `/admin/billing/${inv.id}`,
      cta: "Open invoice",
    });
  }

  // Safety: an upcoming booking whose service consent is not signed.
  for (const c of input.missingConsents) {
    if (c.bookingIds.length === 0) continue;
    out.push({
      key: `consent:${c.formId}`,
      priority: "high",
      title: "Get consent signed",
      reason: `${c.title} is required for an upcoming appointment.`,
      href: `/admin/clients/${input.clientProfileId}/clinical/sign/${c.formId}`,
      cta: "Sign now",
    });
  }

  if (input.openCallbacks > 0) {
    out.push({
      key: "callback",
      priority: "high",
      title: input.openCallbacks === 1 ? "Return their call" : `Return their call (${input.openCallbacks} open)`,
      reason: "They asked us to call them back.",
      href: "/admin/callbacks",
      cta: "Open call-backs",
    });
  }

  if (input.nextFollowUpAt && input.nextFollowUpAt <= input.now) {
    const days = Math.floor((input.now.getTime() - input.nextFollowUpAt.getTime()) / DAY_MS);
    out.push({
      key: "followup",
      priority: "medium",
      title: "Follow-up is due",
      reason: days === 0 ? "Scheduled for today." : `Overdue by ${days} day${days === 1 ? "" : "s"}.`,
      href: `/admin/clients/${input.clientProfileId}?tab=pipeline`,
      cta: "Log the call",
    });
  }

  if (!hasUpcoming && input.packageSessionsRemaining > 0) {
    out.push({
      key: "package",
      priority: "medium",
      title: "Book their next package session",
      reason: `${input.packageSessionsRemaining} prepaid session${input.packageSessionsRemaining === 1 ? "" : "s"} remaining and nothing scheduled.`,
      href: bookHref(input),
      cta: "Book",
    });
  } else if (!hasUpcoming && input.lastVisitAt) {
    const days = Math.floor((input.now.getTime() - input.lastVisitAt.getTime()) / DAY_MS);
    if (days > REBOOK_AFTER_DAYS) {
      out.push({
        key: "rebook",
        priority: "medium",
        title: "Suggest rebooking",
        reason: `Last visit was ${days} days ago and nothing is scheduled.`,
        href: bookHref(input),
        cta: "Book",
      });
    }
  } else if (!hasUpcoming && !input.lastVisitAt) {
    out.push({
      key: "first-visit",
      priority: "low",
      title: "Book a first consultation",
      reason: "No visits yet and nothing scheduled.",
      href: bookHref(input),
      cta: "Book",
    });
  }

  if ((input.reviewableVisits ?? 0) > 0 && hasUpcomingOrRecent(input)) {
    out.push({
      key: "review",
      priority: "low",
      title: "Ask for a review",
      reason: "A recent visit has no review yet.",
      href: "/admin/reviews",
      cta: "Reviews",
    });
  }

  const rank: Record<ActionPriority, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

function hasUpcomingOrRecent(input: NextBestActionInput): boolean {
  if (!input.lastVisitAt) return false;
  return input.now.getTime() - input.lastVisitAt.getTime() <= 30 * DAY_MS;
}
