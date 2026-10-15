// Display helpers for notification feed text (shared by the bell and the
// notifications page). Feed titles are built in src/modules as
// "Label — record name"; the label is translated and the record kept as is.
import { makeT, type T } from "../_i18n/t";

/** "5m ago" style age of an item, in the staff language. */
export function timeAgo(at: Date, t: T = makeT("en")): string {
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return t("just now");
  if (mins < 60) return t("{n}m ago", { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t("{n}h ago", { n: hrs });
  return t("{n}d ago", { n: Math.round(hrs / 24) });
}

/** Translates the fixed label of a feed title ("New lead — Sara" → «عميل محتمل جديد — Sara»). */
export function localizeFeedTitle(title: string, t: T): string {
  const whole = t(title);
  if (whole !== title) return whole;
  const cut = title.indexOf(" — ");
  if (cut < 0) return title;
  const label = title.slice(0, cut);
  const rest = title.slice(cut + 3);
  const invoice = /^Unpaid invoice (.+)$/.exec(label);
  if (invoice) return `${t("Unpaid invoice {number}", { number: invoice[1] })} — ${rest}`;
  return `${t(label)} — ${rest}`;
}
