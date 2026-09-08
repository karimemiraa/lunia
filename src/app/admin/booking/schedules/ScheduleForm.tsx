"use client";

import { useActionState } from "react";
import type { StaffScheduleEntryInput } from "@/modules/booking/staffSchedules";
import { updateScheduleAction, type ScheduleActionState } from "./actions";

const initialState: ScheduleActionState = {};

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const timeInputClass =
  "rounded border border-[var(--color-ink)]/20 px-2 py-1 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

function minutesToHHMM(min: number): string {
  const hours = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (min % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

interface ScheduleFormProps {
  staffUserId: string;
  schedule: StaffScheduleEntryInput[];
}

export function ScheduleForm({ staffUserId, schedule }: ScheduleFormProps) {
  const [state, action, pending] = useActionState(updateScheduleAction, initialState);

  return (
    <form action={action} data-testid="schedule-form" className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="staffUserId" value={staffUserId} />

      <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Day</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Active</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Start</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">End</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((day) => {
              const label = WEEKDAY_LABELS[day.weekday];
              return (
                <tr
                  key={day.weekday}
                  className="border-t border-[var(--color-ink)]/10"
                  data-testid="schedule-row"
                  data-weekday={day.weekday}
                >
                  <td className="px-4 py-2 text-[var(--color-ink)]">{label}</td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      name={`day-${day.weekday}-active`}
                      defaultChecked={day.isActive}
                      aria-label={`${label} active`}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="time"
                      name={`day-${day.weekday}-start`}
                      defaultValue={minutesToHHMM(day.startMin)}
                      aria-label={`${label} start`}
                      className={timeInputClass}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="time"
                      name={`day-${day.weekday}-end`}
                      defaultValue={minutesToHHMM(day.endMin)}
                      aria-label={`${label} end`}
                      className={timeInputClass}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save schedule"}
        </button>
        {state.success && <p className="text-sm text-[var(--color-teal)]">Saved.</p>}
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
