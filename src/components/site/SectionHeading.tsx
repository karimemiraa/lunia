import { ReactNode } from "react";

interface SectionHeadingProps {
  eyebrow?: string;
  heading: ReactNode;
  intro?: ReactNode;
  align?: "start" | "center";
  className?: string;
}

// A small four-point "glow" mark — the brand's moon/star motif, used
// sparingly as a quiet accent rather than decoration for its own sake.
function GlowMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3 w-3 shrink-0 fill-[var(--color-gold)]"
    >
      <path d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z" />
    </svg>
  );
}

// Eyebrow + serif heading + optional intro paragraph — the recurring
// section-opening pattern across the public site. `align="center"` is used
// for narrow, editorial sections; `start` (the default) respects
// writing direction via logical text-align.
export function SectionHeading({ eyebrow, heading, intro, align = "start", className = "" }: SectionHeadingProps) {
  const alignClass = align === "center" ? "text-center items-center mx-auto" : "text-start items-start";

  return (
    <div className={`lunia-scroll flex max-w-2xl flex-col gap-4 ${alignClass} ${className}`.trim()}>
      {eyebrow && (
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-teal-ink)]">
          <GlowMark />
          {eyebrow}
        </span>
      )}
      <h2 className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-ink)] sm:text-5xl">
        {heading}
      </h2>
      {intro && <p className="text-base leading-relaxed text-[var(--color-ink)]/70 sm:text-lg">{intro}</p>}
    </div>
  );
}
