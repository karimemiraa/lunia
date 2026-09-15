import { Reveal } from "./Reveal";

interface JourneyStep {
  title: string;
  body?: string;
}

interface JourneyStepsProps {
  eyebrow?: string;
  heading?: string;
  steps: JourneyStep[];
}

// The client journey rendered as an editorial, scroll-told sequence rather than
// a flat grid: on large screens the heading pins (sticky) in the inline-start
// column while the numbered steps scroll past in the inline-end column, each
// carrying an oversized, ghosted ordinal and a hairline rule. Every step
// reveals on scroll (Reveal is reduced-motion aware and JS-free-degradable).
// Uses logical properties throughout, so it mirrors correctly under RTL.
export function JourneySteps({ eyebrow, heading, steps }: JourneyStepsProps) {
  return (
    <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
      {/* Sticky heading column */}
      <div className="lg:sticky lg:top-28 lg:self-start">
        <div className="flex flex-col gap-5 text-start">
          {eyebrow && (
            <span className="inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-teal-ink)]">
              {eyebrow}
            </span>
          )}
          {heading && (
            <h2 className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-ink)] sm:text-5xl">
              {heading}
            </h2>
          )}
          <span className="mt-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.3em] text-[var(--color-ink)]/35">
            01 / {String(steps.length).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Steps column */}
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <Reveal
            as="li"
            key={step.title}
            delay={index * 80}
            className="relative flex gap-6 border-t border-[var(--line)] py-8 first:border-t-0 first:pt-0 sm:gap-8"
          >
            <span
              aria-hidden="true"
              className="font-[family-name:var(--font-display)] text-5xl font-medium leading-none text-[var(--color-ink)]/12 sm:text-6xl"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-2 pt-1">
              <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{step.title}</h3>
              {step.body && <p className="max-w-md text-sm leading-relaxed text-[var(--color-ink)]/70">{step.body}</p>}
            </div>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
