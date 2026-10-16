"use client";

import { useActionState } from "react";
import { saveJourneyAction, type SaveSettingsState } from "./actions";
import { InlineStatus, SubmitButton } from "../_ui/Form";
import type { JourneySettings } from "@/modules/cms/settings";
import { useStaffT } from "../_i18n/StaffI18n";

const initial: SaveSettingsState = {};

/** Settings → Visit journey: when the visit board's timers turn amber/red. */
export function JourneyForm({ value }: { value: JourneySettings }) {
  const [state, action] = useActionState(saveJourneyAction, initial);
  const t = useStaffT();
  const field = (name: keyof JourneySettings, label: string, min: number, max: number) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      {t(label)}
      <input name={name} type="number" min={min} max={max} defaultValue={Number(value[name])} className="lunia-input !w-24 shrink-0 py-1 text-sm" />
    </label>
  );
  return (
    <section className="flex flex-col gap-5 lunia-card p-5" data-testid="journey-settings">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Visit journey")}</h2>
        <p className="text-sm text-[var(--color-ink)]/65">{t("How the visit board flags customers who have waited too long.")}</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {field("waitAmberMin", "Waiting turns amber after (min)", 1, 120)}
          {field("waitRedMin", "Waiting turns red after (min)", 2, 240)}
          {field("checkoutAmberMin", "Checkout flagged after (min)", 1, 120)}
          {field("roomPrepareMin", "Room preparation time (min)", 0, 60)}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="prayerTimes" defaultChecked={value.prayerTimes} className="h-4 w-4" />
          {t("Show the next prayer time on the visit board")}
        </label>
        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel={t("Saving…")}>{t("Save journey settings")}</SubmitButton>
          <InlineStatus success={state.success ? t("Saved") : undefined} error={state.error} />
        </div>
      </form>
    </section>
  );
}
