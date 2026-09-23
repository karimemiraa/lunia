interface JourneyStep {
  title: string;
  body?: string;
}

interface JourneyRailProps {
  eyebrow?: string;
  heading?: string;
  steps: JourneyStep[];
}

// The customer journey as a vertical "rhythm" timeline on the deep forest brand
// stage. A rail runs down the inline-start with a Glow-star node per step, and
// each step lifts in as it enters the viewport (CinematicScroll's [data-reveal]
// batch; static + fully visible with no JS / reduced motion). This replaces the
// old pinned horizontal scrub, which felt janky and was awkward on mobile — a
// vertical timeline reads as "one rhythm", is robust on every browser, and is
// naturally responsive and RTL-safe (logical properties throughout). The Waves
// brand pattern washes subtly behind it.
export function JourneyRail({ eyebrow, heading, steps }: JourneyRailProps) {
  return (
    <section className="lunia-pattern-waves lunia-pattern-on-dark relative overflow-hidden bg-[var(--color-forest)] py-20 text-[var(--color-cream)] lg:py-28">
      <div className="mx-auto w-full max-w-4xl px-6 lg:px-10">
        <div className="flex max-w-2xl flex-col gap-4">
          {eyebrow && (
            <span className="lunia-scroll flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-canopy)]">
              <span aria-hidden="true" className="lunia-glow-mark" />
              {eyebrow}
            </span>
          )}
          {heading && (
            <h2
              data-splittext
              className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-cream)] sm:text-5xl"
            >
              {heading}
            </h2>
          )}
        </div>

        <ol className="lunia-timeline mt-14 flex flex-col gap-12 lg:mt-20 lg:gap-16">
          <span aria-hidden="true" className="lunia-timeline-line" />
          {steps.map((step, index) => (
            <li key={step.title} data-reveal className="relative">
              <span aria-hidden="true" className="lunia-timeline-node" />
              <div className="flex flex-col gap-3">
                <span className="font-[family-name:var(--font-display)] text-5xl font-medium leading-none text-[var(--color-canopy)]/70 lg:text-6xl">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-cream)] lg:text-3xl">
                  {step.title}
                </h3>
                {step.body && (
                  <p className="max-w-xl text-sm leading-relaxed text-[var(--color-cream)]/70 lg:text-base">
                    {step.body}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
