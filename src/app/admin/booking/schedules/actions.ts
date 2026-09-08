"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { setSchedulesForStaff, type StaffScheduleEntryInput } from "@/modules/booking/staffSchedules";

export interface ScheduleActionState {
  error?: string;
  success?: boolean;
}

// Parses "HH:MM" into minutes-from-midnight. Falls back to 0 for an empty or
// malformed value, which the module-level validation will then reject for
// active days (start < end) rather than silently storing a bad time.
function hhmmToMinutes(value: string): number {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

export async function updateScheduleAction(
  _prev: ScheduleActionState | null,
  formData: FormData,
): Promise<ScheduleActionState> {
  await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const staffUserId = String(formData.get("staffUserId") ?? "").trim();
  if (!staffUserId) {
    return { error: "Missing staff member." };
  }

  const entries: StaffScheduleEntryInput[] = Array.from({ length: 7 }, (_, weekday) => {
    const isActive = formData.get(`day-${weekday}-active`) === "on";
    const start = String(formData.get(`day-${weekday}-start`) ?? "00:00");
    const end = String(formData.get(`day-${weekday}-end`) ?? "00:00");
    return { weekday, startMin: hhmmToMinutes(start), endMin: hhmmToMinutes(end), isActive };
  });

  try {
    await setSchedulesForStaff(staffUserId, entries);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update schedule." };
  }

  revalidatePath("/admin/booking/schedules");
  return { success: true };
}
