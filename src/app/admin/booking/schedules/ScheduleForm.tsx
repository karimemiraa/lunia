"use client";

import { useActionState } from "react";
import type { StaffScheduleEntryInput } from "@/modules/booking/staffSchedules";
import { updateScheduleAction, type ScheduleActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffLocale, useStaffT } from "../../_i18n/StaffI18n";
import { weekdayNames } from "../../calendar/labels";

const initialState: ScheduleActionState = {};

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
  const t = useStaffT();
  const WEEKDAY_LABELS = weekdayNames(useStaffLocale(), "long");

  return (
    <form action={action} data-testid="schedule-form" className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="staffUserId" value={staffUserId} />

      <div className="overflow-x-auto lunia-card">
        <table className="w-full text-start text-sm">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Day")}</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Active")}</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Start")}</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("End")}</th>
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
                      aria-label={t("{day} active", { day: label })}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="time"
                      name={`day-${day.weekday}-start`}
                      defaultValue={minutesToHHMM(day.startMin)}
                      aria-label={t("{day} start", { day: label })}
                      className={timeInputClass}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="time"
                      name={`day-${day.weekday}-end`}
                      defaultValue={minutesToHHMM(day.endMin)}
                      aria-label={t("{day} end", { day: label })}
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
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Saving…") : t("Save schedule")}
        </button>
        <InlineStatus success={state.success ? t("Saved.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
