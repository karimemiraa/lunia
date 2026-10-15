import "server-only";
import { getStaffDisplay } from "../_i18n/display";
import { makeT, type T } from "../_i18n/t";

// Error text for the scheduling server actions (calendar, booking settings,
// waitlist), in the staff locale. Module errors are English sentences; the
// fixed ones are dictionary keys, and the few with ids or values baked in are
// matched here so Arabic staff never see raw English. English is unchanged.

const PATTERNS: { re: RegExp; key: string; vars?: (m: RegExpMatchArray) => Record<string, string> }[] = [
  { re: /^Cannot (.+) a booking with status "(\w+)"$/, key: "This step isn't possible for a booking that is {status}.", vars: (m) => ({ status: m[2] ?? "" }) },
  { re: /^Cannot delete room "(.+)": it has (\d+) appointment\(s\) on file\. Deactivate it instead\.$/, key: "Cannot delete room “{name}”: it has {count} appointment(s) on file. Deactivate it instead.", vars: (m) => ({ name: m[1] ?? "", count: m[2] ?? "" }) },
  { re: /^This service is available to (.+) members$/, key: "This service is available to {tier} members", vars: (m) => ({ tier: m[1] ?? "" }) },
  { re: /^(Booking|Service|Room|Staff user|Visit note) ".*" not found$/, key: "Not found. It may have been deleted." },
  { re: /^Booking ".*" has no appointment$/, key: "This booking has no appointment." },
  { re: /^Invalid (date|time) /, key: "Invalid date or time." },
  { re: /^Invalid /, key: "Invalid value." },
];

const STATUS_WORD: Record<string, string> = {
  REQUESTED: "requested",
  CONFIRMED: "confirmed",
  CHECKED_IN: "checked in",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "a no-show",
};

/** Translates one English module/action message for the given translator. */
export function localizeError(message: string, t: T): string {
  // Zod validation errors arrive as a JSON array of issues; show the first message.
  if (message.startsWith("[")) {
    try {
      const issues = JSON.parse(message) as { message?: string }[];
      if (issues[0]?.message) return t(issues[0].message);
    } catch {
      /* not JSON — fall through */
    }
  }
  for (const p of PATTERNS) {
    const m = message.match(p.re);
    if (!m) continue;
    const vars = p.vars?.(m) ?? {};
    if (vars.status) vars.status = t(STATUS_WORD[vars.status] ?? vars.status);
    return t(p.key, vars);
  }
  return t(message);
}

/** The translator for the current staff member's locale. */
export async function actionT(): Promise<{ t: T; locale: "en" | "ar" }> {
  const { locale } = await getStaffDisplay();
  return { t: makeT(locale), locale };
}

/** Error text for a caught error, in the staff locale (English stays the module's text). */
export async function errorText(err: unknown, fallback = "Something went wrong."): Promise<string> {
  const { t, locale } = await actionT();
  const message = err instanceof Error ? err.message : fallback;
  return locale === "ar" ? localizeError(message, t) : message;
}
