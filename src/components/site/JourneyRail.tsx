interface JourneyStep {
  title: string;
  body?: string;
}

interface JourneyRailProps {
  eyebrow?: string;
  heading?: string;
  steps: JourneyStep[];
}

// The customer journey as a pinned horizontal-scroll rail (rivive-style): on
// desktop the section pins and the card track slides sideways as you scroll
// down (driven by CinematicScroll's [data-horizontal] handler). On mobile — and
// with no JS — it's a normal horizontal swipe rail (.lunia-hrail), so content
// is always reachable. RTL-safe via logical padding.
export function JourneyRail({ eyebrow, heading, steps }: JourneyRailProps) {
  return (
    <section
      data-horizontal
      className="lunia-hrail relative bg-[var(--color-forest)] py-20 text-[var(--color-cream)] lg:py-28"
    >
      <div className="mx-auto mb-10 w-full max-w-6xl px-6 lg:mb-14 lg:px-10">
        <div className="flex max-w-2xl flex-col gap-4">
          {eyebrow && (
            <span className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-canopy)]">
              <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-[var(--color-canopy)] to-transparent" />
              {eyebrow}
            </span>
          )}
          {heading && (
            <h2 data-splittext className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-cream)] sm:text-5xl">
              {heading}
            </h2>
          )}
        </div>
      </div>

      <div
        data-horizontal-track
        className="flex gap-5 px-6 sm:gap-6 lg:w-max lg:px-10"
      >
        {steps.map((step, index) => (
          <article
            key={step.title}
            className="flex w-[78vw] shrink-0 snap-start flex-col justify-between gap-8 rounded-[var(--radius-lg)] border border-[var(--color-cream)]/15 bg-[var(--color-cream)]/[0.05] p-8 backdrop-blur-sm sm:w-[24rem] lg:w-[26rem] lg:p-10"
          >
            <span className="font-[family-name:var(--font-display)] text-6xl font-medium leading-none text-[var(--color-canopy)]/80 lg:text-7xl">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-3">
              <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-cream)] lg:text-3xl">{step.title}</h3>
              {step.body && <p className="text-sm leading-relaxed text-[var(--color-cream)]/70 lg:text-base">{step.body}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
