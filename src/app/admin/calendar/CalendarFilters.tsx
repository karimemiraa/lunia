"use client";

import { useRouter } from "next/navigation";
import type { StaffOption } from "@/modules/booking/bookings";

interface CalendarFiltersProps {
  date: string;
  staffUserId: string;
  staffOptions: StaffOption[];
  todayISO: string;
}

const inputClass =
  "rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

const buttonClass =
  "rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)]";

// Shifts a "YYYY-MM-DD" calendar date by `deltaDays`, using UTC date math so
// this never depends on the host browser's own timezone (mirrors the
// booking module's own date-string handling).
function shiftDateISO(dateISO: string, deltaDays: number): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

// Date + staff filter bar for the calendar day view. Navigating updates the
// page's search params (date, staffUserId), which page.tsx reads server-side
// to re-query listDayAppointments.
export function CalendarFilters({ date, staffUserId, staffOptions, todayISO }: CalendarFiltersProps) {
  const router = useRouter();

  function navigate(nextDate: string, nextStaffUserId: string) {
    const params = new URLSearchParams();
    params.set("date", nextDate);
    if (nextStaffUserId) params.set("staffUserId", nextStaffUserId);
    router.push(`/admin/calendar?${params.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Date</span>
        <input
          type="date"
          value={date}
          onChange={(event) => navigate(event.target.value, staffUserId)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Staff</span>
        <select value={staffUserId} onChange={(event) => navigate(date, event.target.value)} className={inputClass}>
          <option value="">All staff</option>
          {staffOptions.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {staff.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <button type="button" onClick={() => navigate(shiftDateISO(date, -1), staffUserId)} className={buttonClass}>
          &lsaquo; Prev day
        </button>
        <button type="button" onClick={() => navigate(todayISO, staffUserId)} className={buttonClass}>
          Today
        </button>
        <button type="button" onClick={() => navigate(shiftDateISO(date, 1), staffUserId)} className={buttonClass}>
          Next day &rsaquo;
        </button>
      </div>
    </div>
  );
}
