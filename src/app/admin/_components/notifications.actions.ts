"use server";

import { requireAdmin } from "./requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { sendAssigneeDigests } from "@/modules/notifications/digest";

export type DigestActionResult = { ok: true; message: string } | { ok: false; error: string };

// Emails each staff member a digest of the open items assigned to them.
// Manual trigger for now; the same sendAssigneeDigests() can be run on a
// daily cron. Gated on CLIENT_MANAGE.
export async function sendDigestsAction(): Promise<DigestActionResult> {
  await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  try {
    const { assigneesNotified, emailsSent } = await sendAssigneeDigests();
    if (assigneesNotified === 0) return { ok: true, message: "No open assigned items — nothing to send." };
    return { ok: true, message: `Sent ${emailsSent} digest email${emailsSent === 1 ? "" : "s"} to assignees.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to send digests." };
  }
}
