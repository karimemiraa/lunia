// Decorative celestial layer: the brand's four-point "Glow" star motif
// scattered across a panel, plus a soft lunar halo. Purely ornamental
// (aria-hidden); all motion is CSS and reduced-motion aware. Used on the hero,
// the admin login brand panel, and CTA bands to carry the "tranquil energy"
// of the identity without competing with the message.

interface StarfieldProps {
  className?: string;
  /** Show the large soft "moon" halo in the corner. */
  moon?: boolean;
  tone?: "teal" | "cream";
}

// The exact wordmark glow mark, as a reusable star.
function Star({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} style={style}>
      <path
        fill="currentColor"
        d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z"
      />
    </svg>
  );
}

// Fixed, hand-placed positions so the composition stays balanced (rule of
// thirds) rather than random on every render.
const STARS = [
  { top: "14%", left: "8%", size: 26, delay: "0s", dur: "5s", opacity: 0.9 },
  { top: "26%", left: "82%", size: 16, delay: "1.2s", dur: "4.5s", opacity: 0.7 },
  { top: "62%", left: "16%", size: 14, delay: "0.6s", dur: "6s", opacity: 0.6 },
  { top: "72%", left: "70%", size: 22, delay: "1.8s", dur: "5.5s", opacity: 0.85 },
  { top: "42%", left: "48%", size: 10, delay: "0.9s", dur: "4s", opacity: 0.5 },
  { top: "84%", left: "40%", size: 12, delay: "2.4s", dur: "6.5s", opacity: 0.55 },
  { top: "10%", left: "58%", size: 12, delay: "1.5s", dur: "5.2s", opacity: 0.6 },
];

export function Starfield({ className = "", moon = true, tone = "teal" }: StarfieldProps) {
  const starColor = tone === "teal" ? "text-[var(--color-teal)]" : "text-[var(--color-cream)]";
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {moon && (
        <div
          className="lunia-glow-pulse absolute -right-24 -top-24 h-72 w-72 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--color-teal) 55%, transparent), transparent 70%)",
          }}
        />
      )}
      {STARS.map((s, i) => (
        <Star
          key={i}
          className={`lunia-twinkle absolute ${starColor}`}
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            animationDelay: s.delay,
            animationDuration: s.dur,
          }}
        />
      ))}
    </div>
  );
}
