"use server";

import { requireAdmin } from "./requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { sendAssigneeDigests } from "@/modules/notifications/digest";
import { getStaffT } from "../_i18n/display";

export type DigestActionResult = { ok: true; message: string } | { ok: false; error: string };

// Emails each staff member a digest of the open items assigned to them.
// Manual trigger for now; the same sendAssigneeDigests() can be run on a
// daily cron. Gated on CLIENT_MANAGE.
export async function sendDigestsAction(): Promise<DigestActionResult> {
  await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const t = await getStaffT();
  try {
    const { assigneesNotified, emailsSent } = await sendAssigneeDigests();
    if (assigneesNotified === 0) return { ok: true, message: t("No open assigned items — nothing to send.") };
    return { ok: true, message: emailsSent === 1 ? t("Sent 1 digest email to assignees.") : t("Sent {count} digest emails to assignees.", { count: emailsSent }) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? t(err.message) : t("Failed to send digests.") };
  }
}
