import type { ReactNode } from "react";

type Tone = "page" | "mist" | "white" | "cream" | "forest";

interface ChapterProps {
  id?: string;
  tone?: Tone;
  eyebrow?: string;
  heading?: string;
  lead?: string;
  align?: "center" | "start";
  /** Full-bleed children (e.g. a gallery that runs to the viewport edge). */
  bleed?: boolean;
  /** Brand pattern washed behind the chapter. */
  pattern?: "waves" | "mosaic";
  className?: string;
  children?: ReactNode;
}

const TONES: Record<Tone, string> = {
  page: "bg-[var(--color-page)]",
  mist: "bg-[#e8f1ee]",
  white: "bg-white",
  cream: "bg-[color-mix(in_srgb,var(--color-cream)_55%,var(--color-page))]",
  forest: "bg-[var(--color-forest)] text-[var(--color-cream)]",
};

// One Apple-style "chapter": generous vertical air, a headline block
// (eyebrow + big display heading + lead) and its content. `tone` alternates the
// ground so chapters read as distinct scenes.
export function Chapter({ id, tone = "page", eyebrow, heading, lead, align = "center", bleed, pattern, className = "", children }: ChapterProps) {
  const dark = tone === "forest";
  const patternClass = pattern ? `lunia-pattern-${pattern}${dark ? " lunia-pattern-on-dark" : ""}` : "";
  const headAlign = align === "center" ? "mx-auto items-center text-center" : "items-start text-start";

  return (
    <section id={id} className={`relative scroll-mt-32 py-[clamp(5.5rem,13svh,9.5rem)] ${TONES[tone]} ${patternClass} ${className}`.trim()}>
      {(eyebrow || heading || lead) && (
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6">
          <header className={`flex max-w-3xl flex-col ${headAlign}`}>
            {eyebrow && (
              <span className={`lx-eyebrow lunia-scroll ${dark ? "text-[var(--color-teal)]" : ""}`}>
                <span aria-hidden="true" className="lunia-glow-mark" />
                {eyebrow}
              </span>
            )}
            {heading && (
              <h2 data-splittext className={`lx-display lx-h2 mt-5 ${dark ? "text-[var(--color-cream)]" : "text-[var(--color-ink)]"}`}>
                {heading}
              </h2>
            )}
            {lead && <p className={`lx-lead lunia-scroll mt-6 max-w-2xl ${dark ? "!text-[var(--color-cream)]/75" : ""}`}>{lead}</p>}
          </header>
        </div>
      )}
      <div className={bleed ? "mt-12 lg:mt-16" : `mx-auto w-full max-w-7xl px-5 sm:px-6 ${heading || eyebrow ? "mt-12 lg:mt-16" : ""}`}>{children}</div>
    </section>
  );
}
