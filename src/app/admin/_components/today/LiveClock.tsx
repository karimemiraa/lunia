"use client";

import { useEffect, useMemo, useState } from "react";
import { useStaffLocale } from "../../_i18n/StaffI18n";
import { intlLocale } from "../../_i18n/t";


// Center-local wall clock that ticks every minute. Renders the server's
// time first so there is no empty flash, then keeps itself current.
export function LiveClock({ initialISO }: { initialISO: string }) {
  const locale = useStaffLocale();
  const fmt = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale, "en-US"), { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" }), [locale]);
  const [now, setNow] = useState(() => new Date(initialISO));
  useEffect(() => {
    const tick = () => setNow(new Date());
    const untilNextMinute = 60_000 - (Date.now() % 60_000);
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, untilNextMinute);
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  return (
    <time dateTime={now.toISOString()} className="lunia-tabular font-[family-name:var(--font-display)] text-4xl leading-none text-[var(--color-ink)] sm:text-5xl">
      {fmt.format(now)}
    </time>
  );
}
