interface CinematicImageProps {
  src: string;
  alt: string;
  eyebrow?: string;
  headline?: string;
  intro?: string;
}

// A cinematic, Clingr-style pinned-scale moment: the section is tall, its panel
// pins to the viewport, and the framed image scales from a rounded card up to
// full-bleed as you scroll through it (scrubbed via native scroll-timeline — see
// the `.cine*` rules in globals.css). The caption fades up as the image fills.
// Degrades to a clean full-width image band where scroll-timeline is
// unsupported or reduced motion is requested.
export function CinematicImage({ src, alt, eyebrow, headline, intro }: CinematicImageProps) {
  return (
    <section className="cine relative bg-[var(--color-page)]">
      <div className="cine-sticky">
        <div className="cine-frame">
          {/* eslint-disable-next-line @next/next/no-img-element -- brand photo served statically from /public */}
          <img src={src} alt={alt} />
          {(eyebrow || headline || intro) && (
            <>
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[var(--color-ink)]/75 via-[var(--color-ink)]/20 to-transparent"
              />
              <div className="cine-caption absolute inset-x-0 bottom-0 mx-auto flex max-w-4xl flex-col items-center gap-4 px-6 pb-[10vh] text-center">
                {eyebrow && (
                  <span className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-teal)]">
                    {eyebrow}
                  </span>
                )}
                {headline && (
                  <h2 className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-cream)] sm:text-5xl">
                    {headline}
                  </h2>
                )}
                {intro && <p className="max-w-2xl text-base leading-relaxed text-[var(--color-cream)]/85">{intro}</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
