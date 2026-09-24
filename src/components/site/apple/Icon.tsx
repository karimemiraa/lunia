// A small, consistent line-icon set (24px grid, 1.6 stroke, round caps) for
// the Apple-style feature tiles, service strips and meta chips. Kept inline so
// icons inherit currentColor and ship no extra requests.
const PATHS = {
  diagnose: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.6-1.9L20 20M10.5 8v5M8 10.5h5",
  leaf: "M5 19c0-8 5-13 14-14-1 9-6 14-14 14Zm0 0 7-7",
  shield: "M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6l-7-3Zm-3 9 2 2 4-4",
  sparkle: "M12 3c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7Zm6 11c.3 1.7.9 2.3 2.6 2.6-1.7.3-2.3.9-2.6 2.6-.3-1.7-.9-2.3-2.6-2.6 1.7-.3 2.3-.9 2.6-2.6Z",
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 8h3v3H8z",
  gift: "M4 11h16v9H4zM3 7h18v4H3zm9 0v13M12 7c-1.5-3-5-3.5-5-1s3 1 5 1Zm0 0c1.5-3 5-3.5 5-1s-3 1-5 1Z",
  drop: "M12 3c3.5 4.4 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.6 6-11Zm-2.5 11.5A2.5 2.5 0 0 0 12 17",
  heart: "M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.3 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5",
  phone: "M5 4h3.5l1.6 4-2.1 1.3a11 11 0 0 0 5.7 5.7l1.3-2.1 4 1.6V18a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z",
  chat: "M5 18.5 3.5 21l3.4-1A9 9 0 1 0 5 18.5Zm4-6.5h.01M12 12h.01M15 12h.01",
  pin: "M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0c0 5.6-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  flask: "M9 3h6m-5 0v5.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 8.5V3M7.5 14h9",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  repeat: "M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5m5 3a8 8 0 0 1-13.7 5.6L4 15m0 5v-5h5",
  mail: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm-.5.7L12 13l8.5-6.3",
  chart: "M4 20h16M6 16l4-5 3 3 5-7",
  camera: "M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  lock: "M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm2 0V8a4 4 0 1 1 8 0v3",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  hand: "M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-2-3.5a1.4 1.4 0 0 1 2.3-1.6L8 13",
  check: "m5 12.5 4.5 4.5L19 7.5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-6 w-6" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
