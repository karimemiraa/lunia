"use client";

import { useRouter } from "next/navigation";
import type { StaffOption } from "@/modules/booking/bookings";

interface StaffPickerProps {
  staffOptions: StaffOption[];
  staffUserId: string;
}

// Mirrors admin/calendar/CalendarFilters.tsx's staff select: navigating
// updates the page's staffUserId search param, which page.tsx reads
// server-side to re-query that staff member's schedule.
export function StaffPicker({ staffOptions, staffUserId }: StaffPickerProps) {
  const router = useRouter();

  return (
    <div className="mb-6 flex items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Staff member</span>
        <select
          value={staffUserId}
          onChange={(event) => router.push(`/admin/booking/schedules?staffUserId=${event.target.value}`)}
          data-testid="schedule-staff-picker"
          className="rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none"
        >
          {staffOptions.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {staff.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
