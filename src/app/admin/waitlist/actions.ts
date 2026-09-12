"use server";

// Server actions backing the admin waitlist view (page.tsx) and its
// walk-up add form (WaitlistAddForm.tsx). Every action re-checks
// BOOKING_MANAGE itself (never trusts that the page that rendered the
// button already checked it), mirroring src/app/admin/calendar/actions.ts.
// Waitlist adds are not audited (per the D1/D2 build instructions) --
// unlike a real booking, joining a waitlist commits nothing.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { joinWaitlist, notifyWaitlistForSlot } from "@/modules/booking/waitlist";

export type ActionResult = { ok: true } | { ok: false; error: string };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function revalidateWaitlist(): void {
  revalidatePath("/admin/waitlist");
}

export interface WalkupWaitlistInput {
  serviceId: string;
  desiredDateISO: string;
  desiredWindow?: string;
  name: string;
  phone?: string;
  email?: string;
}

export async function addWalkupWaitlistAction(input: WalkupWaitlistInput): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);

  const name = input.name.trim();
  const phone = input.phone?.trim() || undefined;
  const email = input.email?.trim() || undefined;
  if (!input.serviceId || !input.desiredDateISO || !name || (!phone && !email)) {
    return { ok: false, error: "Service, desired date, name, and a phone or email are required." };
  }

  try {
    await joinWaitlist({
      serviceId: input.serviceId,
      desiredDateISO: input.desiredDateISO,
      desiredWindow: input.desiredWindow?.trim() || undefined,
      name,
      phone,
      email,
      locale: "ar",
    });
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  revalidateWaitlist();
  return { ok: true };
}

// Manually re-runs the same notify-on-free path cancel()/reschedule() call
// automatically, for staff who want to nudge waiting clients about a slot
// without waiting for an actual cancellation (e.g. a schedule was just
// opened up by adding an extra staff shift for that day).
export async function notifyWaitlistNowAction(serviceId: string, desiredDateISO: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await notifyWaitlistForSlot(serviceId, desiredDateISO);
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  revalidateWaitlist();
  return { ok: true };
}
