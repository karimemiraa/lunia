"use client";

import { useEffect, useState } from "react";

interface NowLineProps {
  /** Grid start, minutes from midnight (center-local). */
  startMin: number;
  /** Grid end, minutes from midnight. */
  endMin: number;
  /** Pixel height of one hour in the grid. */
  hourPx: number;
}

const CENTER_OFFSET_MIN = 180;

function nowMinutesCenter(): number {
  const d = new Date();
  return ((d.getUTCHours() * 60 + d.getUTCMinutes() + CENTER_OFFSET_MIN) % 1440 + 1440) % 1440;
}

// A thin "now" marker across the day grid, refreshed every minute. Rendered
// only for today (the parent decides); returns nothing outside the grid range.
export function NowLine({ startMin, endMin, hourPx }: NowLineProps) {
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMin(nowMinutesCenter());
    const id = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(interval);
    };
  }, []);
  if (min === null || min < startMin || min > endMin) return null;
  const top = ((min - startMin) / 60) * hourPx;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10" style={{ top }} data-testid="now-line">
      <div className="relative h-px bg-[#d92d20]">
        <span className="absolute -start-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#d92d20]" />
      </div>
    </div>
  );
}
