import { SectionHeading } from "./SectionHeading";

interface JourneyStep {
  title: string;
  body?: string;
}

interface JourneyStepsProps {
  eyebrow?: string;
  heading?: string;
  steps: JourneyStep[];
}

// The brand's quiet moon/star "glow" mark, used here as the step marker.
function GlowMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path
        fill="currentColor"
        d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z"
      />
    </svg>
  );
}

// Renders the 6-moment client journey (Analyze → Personalize → Treat →
// Relax → Maintain → Return) as a quiet numbered sequence rather than a
// stock "process steps" grid: each marker carries the glow motif instead of
// a generic icon, and the ordinal is typographic (uppercase, tracked out)
// rather than boxed. Works with any step count the caller passes, though
// the brand journey is always 6. Order follows source order, which already
// respects the array direction the page provides — no side-specific
// classes here, so it mirrors correctly under RTL.
export function JourneySteps({ eyebrow, heading, steps }: JourneyStepsProps) {
  return (
    <div className="flex flex-col gap-14">
      {heading && <SectionHeading eyebrow={eyebrow} heading={heading} align="center" className="mx-auto" />}

      <ol className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-4 text-start">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--color-gold)]/40 bg-[var(--color-cream)]/50 text-[var(--color-gold)]">
                <GlowMark className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-ink)]/40">
                0{index + 1}
              </span>
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{step.title}</h3>
            {step.body && <p className="text-sm leading-relaxed text-[var(--color-ink)]/70">{step.body}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
