interface JourneyStep {
  title: string;
  body?: string;
}

interface JourneyStickyProps {
  id?: string;
  eyebrow: string;
  heading: string;
  stepLabel: string;
  steps: JourneyStep[];
}

type StepMedia = { type: "video"; src: string; poster: string } | { type: "image"; src: string };

// One film/photo per moment, in journey order: Analyze, Personalize, Treat,
// Relax, Maintain, Return. Extra steps (if the copy grows) reuse the last.
const MEDIA: StepMedia[] = [
  { type: "video", src: "/media/analyze.mp4", poster: "/media/analyze.jpg" },
  { type: "video", src: "/media/personalize.mp4", poster: "/media/personalize.jpg" },
  { type: "video", src: "/media/treat.mp4", poster: "/media/treat.jpg" },
  { type: "image", src: "/media/relax.webp" },
  { type: "image", src: "/media/ritual-shelf.webp" },
  { type: "image", src: "/media/glow.webp" },
];

const mediaFor = (i: number) => MEDIA[Math.min(i, MEDIA.length - 1)];
const stillFor = (m: StepMedia) => (m.type === "video" ? m.poster : m.src);

// The customer journey told the way Apple tells a feature story: the steps
// scroll on one side while a sticky media panel on the other crossfades to the
// matching film/photo as each step takes focus (CinematicScroll's
// [data-steps] toggles .is-active and plays only the active film). A progress
// rail with Glow-star nodes fills as you go. On mobile each step simply
// carries its own still above the copy. Without JS every step is fully shown.
export function JourneySticky({ id, eyebrow, heading, stepLabel, steps }: JourneyStickyProps) {
  return (
    <section
      id={id}
      data-steps
      className="scroll-mt-32 lunia-pattern-waves lunia-pattern-on-dark relative bg-[var(--color-forest)] py-[clamp(6rem,14svh,10rem)] text-[var(--color-cream)]"
    >
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-6">
        <header className="flex max-w-3xl flex-col items-start">
          <span className="lx-eyebrow lunia-scroll text-[var(--color-teal)]">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {eyebrow}
          </span>
          <h2 data-splittext className="lx-display lx-h2 mt-5 text-[var(--color-cream)]">
            {heading}
          </h2>
        </header>

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          {/* Sticky media panel (desktop) */}
          <div className="hidden lg:block">
            <div className="lx-steps-media shadow-[0_40px_90px_-50px_rgba(0,0,0,0.6)]">
              {steps.map((step, i) => {
                const m = mediaFor(i);
                return (
                  <div key={step.title} data-step-media className={i === 0 ? "is-active" : ""}>
                    {m.type === "video" ? (
                      <video muted loop playsInline preload={i === 0 ? "metadata" : "none"} poster={m.poster} aria-hidden="true">
                        <source src={m.src} type="video/mp4" />
                      </video>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- static brand media
                      <img src={m.src} alt="" loading="lazy" decoding="async" />
                    )}
                  </div>
                );
              })}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 rounded-[30px] ring-1 ring-inset ring-white/10" />
            </div>
          </div>

          {/* Steps with progress rail */}
          <ol data-steps-list className="lunia-timeline relative flex flex-col gap-16 lg:gap-0">
            <span aria-hidden="true" className="lunia-timeline-line" />
            <span
              aria-hidden="true"
              data-steps-progress
              className="lx-steps-progress absolute bottom-[0.4rem] top-[0.4rem] w-[1.5px] bg-[var(--color-teal)] [inset-inline-start:0.75rem]"
              style={{ transform: "scaleY(0)" }}
            />
            {steps.map((step, i) => {
              const m = mediaFor(i);
              return (
                <li
                  key={step.title}
                  data-step
                  className={`lx-step lg:flex lg:min-h-[62svh] lg:flex-col lg:justify-center ${i === 0 ? "is-active" : ""}`}
                >
                  <div className="mb-7 aspect-[4/3] overflow-hidden rounded-[24px] lg:hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
                    <img src={stillFor(m)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </div>
                  <div className="relative">
                    <span aria-hidden="true" className="lunia-timeline-node !top-[0.3rem]" />
                    <p className="text-sm font-medium tracking-[0.22em] text-[var(--color-teal)]">
                      {stepLabel} {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="lx-display mt-3 text-[clamp(2.1rem,1.5rem+1.8vw,3.25rem)] text-[var(--color-cream)]">
                      {step.title}
                    </h3>
                    {step.body && (
                      <p className="mt-4 max-w-md text-[1.075rem] leading-relaxed text-[var(--color-cream)]/75">{step.body}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
