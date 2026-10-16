// Prayer times for the clinic (Riyadh), Umm al-Qura method — computed
// locally with `adhan`, no network call. Used by the visit board so the
// front desk can plan around prayer.

import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";

const RIYADH = new Coordinates(24.7136, 46.6753);
export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type Prayer = (typeof PRAYERS)[number];

export interface PrayerTime {
  prayer: Prayer;
  at: Date;
}

/** Today's five prayers (Riyadh date of `now`). */
export function prayerTimes(now: Date = new Date()): PrayerTime[] {
  // adhan takes a calendar date; use Riyadh's date (UTC+3, no DST).
  const riyadh = new Date(now.getTime() + 3 * 3_600_000);
  const day = new Date(Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate(), 12));
  const p = new PrayerTimes(RIYADH, day, CalculationMethod.UmmAlQura());
  return PRAYERS.map((prayer) => ({ prayer, at: p[prayer] }));
}

/** The next prayer from `now` (tomorrow's Fajr after Isha). */
export function nextPrayer(now: Date = new Date()): PrayerTime {
  const today = prayerTimes(now).find((p) => p.at.getTime() > now.getTime());
  return today ?? prayerTimes(new Date(now.getTime() + 86_400_000))[0]!;
}
