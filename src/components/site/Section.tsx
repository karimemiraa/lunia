import { PropsWithChildren } from "react";

type SectionTone = "plain" | "tinted" | "ink";

interface SectionProps extends PropsWithChildren {
  tone?: SectionTone;
  as?: "section" | "div";
  className?: string;
  /** Inner max-width container class; pass "" to opt out (e.g. full-bleed media). */
  containerClassName?: string;
  id?: string;
}

const TONE_CLASSES: Record<SectionTone, string> = {
  plain: "",
  tinted: "bg-[var(--color-cream)]/50",
  ink: "bg-[var(--color-ink)] text-[var(--color-cream)]",
};

// Vertical-rhythm wrapper used by every public section: generous block
// spacing plus a centered max-width container. `tone` swaps the background
// wash without callers needing to know the underlying color tokens.
export function Section({
  children,
  tone = "plain",
  as = "section",
  className = "",
  containerClassName = "mx-auto w-full max-w-6xl px-6",
  id,
}: SectionProps) {
  const Tag = as;
  return (
    <Tag id={id} className={`py-20 sm:py-28 ${TONE_CLASSES[tone]} ${className}`.trim()}>
      <div className={containerClassName}>{children}</div>
    </Tag>
  );
}
