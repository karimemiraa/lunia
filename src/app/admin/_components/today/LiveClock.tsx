"use client";

import { useEffect, useState } from "react";

const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" });

// Center-local wall clock that ticks every minute. Renders the server's
// time first so there is no empty flash, then keeps itself current.
export function LiveClock({ initialISO }: { initialISO: string }) {
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
