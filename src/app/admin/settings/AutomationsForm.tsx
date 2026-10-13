"use client";

import { useActionState } from "react";
import { saveAutomationsAction, type SaveSettingsState } from "./actions";
import { InlineStatus, SubmitButton } from "../_ui/Form";
import type { AutomationSettings } from "@/modules/cms/settings";

export interface JobStatusDTO {
  name: string;
  label: string;
  hour: number;
  lastRunIso: string | null;
  ok: boolean | null;
  summary: string | null;
}

const initial: SaveSettingsState = {};
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function Toggle({ name, label, help, defaultChecked, testId }: { name: string; label: string; help: string; defaultChecked: boolean; testId: string }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-4 w-4" data-testid={testId} />
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-[var(--color-ink)]/60">{help}</span>
      </span>
    </label>
  );
}

/** Settings → Automations: what the background worker does on its own each day. */
export function AutomationsForm({ value, jobs }: { value: AutomationSettings; jobs: JobStatusDTO[] }) {
  const [state, action] = useActionState(saveAutomationsAction, initial);
  return (
    <section className="flex flex-col gap-5 lunia-card p-5" data-testid="automations-settings">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Automations</h2>
        <p className="text-sm text-[var(--color-ink)]/65">
          Daily jobs the system runs on its own (Riyadh time). Customer messages respect each customer&apos;s preferences, and you can edit their wording in
          Message templates.
        </p>
      </div>
      <form action={action} className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Toggle
            name="packageReminderEnabled"
            defaultChecked={value.packageReminderEnabled}
            testId="automation-package-reminders"
            label="Remind customers before a package expires"
            help="Once per package, if sessions are left. Only applies to packages with a validity period."
          />
          <label className="ms-7 flex items-center gap-2 text-sm">
            Days before expiry
            <input name="packageReminderDays" type="number" min={1} max={60} defaultValue={value.packageReminderDays} className="lunia-input !w-24 shrink-0 py-1 text-sm" />
          </label>
        </div>
        <div className="flex flex-col gap-3">
          <Toggle
            name="winBackEnabled"
            defaultChecked={value.winBackEnabled}
            testId="automation-win-back"
            label="Invite lapsed customers back (“We miss you”)"
            help="Marketing message to customers whose last visit was a while ago and who have nothing booked. Skips customers who opted out of offers; at most once every 6 months per customer."
          />
          <div className="ms-7 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              After
              <input name="winBackDays" type="number" min={30} max={365} defaultValue={value.winBackDays} className="lunia-input !w-24 shrink-0 py-1 text-sm" />
              days without a visit
            </label>
            <label className="flex items-center gap-2">
              Max
              <input name="winBackDailyCap" type="number" min={1} max={500} defaultValue={value.winBackDailyCap} className="lunia-input !w-24 shrink-0 py-1 text-sm" />
              per day
            </label>
          </div>
        </div>
        <Toggle
          name="staffDigestEnabled"
          defaultChecked={value.staffDigestEnabled}
          testId="automation-staff-digest"
          label="Morning email digest for the team"
          help="At 8:00, each staff member gets an email listing the inquiries, leads and WhatsApp chats assigned to them."
        />
        <div className="flex flex-col gap-3">
          <Toggle
            name="invoiceReminderEnabled"
            defaultChecked={value.invoiceReminderEnabled}
            testId="automation-invoice-reminders"
            label="Remind customers about unpaid invoices"
            help="At 10:00, re-sends an unpaid invoice (with a pay link when online payments are set up) by WhatsApp, or email if there's no phone. At most two reminders per invoice."
          />
          <label className="ms-7 flex items-center gap-2 text-sm">
            Every
            <input name="invoiceReminderDays" type="number" min={1} max={30} defaultValue={value.invoiceReminderDays} className="lunia-input !w-24 shrink-0 py-1 text-sm" />
            days while unpaid
          </label>
        </div>
        <div className="flex flex-col gap-3">
          <Toggle
            name="autoNoShowEnabled"
            defaultChecked={value.autoNoShowEnabled}
            testId="automation-auto-no-show"
            label="Mark missed appointments as no-shows"
            help="At 2:00, confirmed appointments that were never checked in are marked as no-shows, so reports and no-show rates stay accurate. Looks back 14 days only."
          />
          <label className="ms-7 flex items-center gap-2 text-sm">
            After
            <input name="autoNoShowHours" type="number" min={2} max={168} defaultValue={value.autoNoShowHours} className="lunia-input !w-24 shrink-0 py-1 text-sm" />
            hours with no check-in
          </label>
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Saving…">Save automations</SubmitButton>
          <InlineStatus success={state.success ? "Saved" : undefined} error={state.error} />
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="automation-runs">
          <thead>
            <tr className="text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
              <th className="py-1.5 pe-4 font-medium">Job</th>
              <th className="py-1.5 pe-4 font-medium">Runs at</th>
              <th className="py-1.5 pe-4 font-medium">Last run</th>
              <th className="py-1.5 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.name} className="border-t border-[var(--line)]">
                <td className="py-2 pe-4">{j.label}</td>
                <td className="py-2 pe-4 tabular-nums">{String(j.hour).padStart(2, "0")}:00</td>
                <td className="py-2 pe-4 tabular-nums">{j.lastRunIso ? fmt.format(new Date(j.lastRunIso)) : "Not yet"}</td>
                <td className={`py-2 ${j.ok === false ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]/70"}`}>{j.summary ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
