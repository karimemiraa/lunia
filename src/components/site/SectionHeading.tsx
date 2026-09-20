import { ReactNode } from "react";

interface SectionHeadingProps {
  eyebrow?: string;
  heading: ReactNode;
  intro?: ReactNode;
  align?: "start" | "center";
  className?: string;
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
        <span className={`flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-teal-ink)] ${align === "center" ? "justify-center" : ""}`}>
          {align !== "center" && (
            <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-[var(--color-teal-ink)] to-transparent" />
          )}
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
