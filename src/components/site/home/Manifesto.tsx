interface ManifestoProps {
  id?: string;
  eyebrow: string;
  text: string;
}

// The brand philosophy as one large statement whose words light up as you read
// (Apple's scroll-highlight, scrubbed by CinematicScroll's [data-highlight]).
// It sits on the deep forest stage over a slow teal water film — the "fluid
// waves" of the brand pattern, made literal. Without JS every word is simply
// shown at full strength.
export function Manifesto({ id, eyebrow, text }: ManifestoProps) {
  return (
    <section
      id={id}
      className="relative isolate scroll-mt-16 overflow-clip bg-[var(--color-forest)] py-[20svh] text-[var(--color-cream)]"
    >
      <video
        data-inview-play
        muted
        loop
        playsInline
        preload="none"
        poster="/media/water.jpg"
        aria-hidden="true"
        className="absolute inset-0 -z-20 h-full w-full object-cover opacity-50"
      >
        <source src="/media/water.mp4" type="video/mp4" />
      </video>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,var(--color-forest)_0%,rgba(43,77,71,0.72)_28%,rgba(43,77,71,0.78)_72%,var(--color-forest)_100%)]"
      />

      <div className="mx-auto w-full max-w-5xl px-6">
        <span className="lx-eyebrow text-[var(--color-teal)]">
          <span aria-hidden="true" className="lunia-glow-mark" />
          {eyebrow}
        </span>
        <p data-highlight className="lx-highlight lx-display mt-8 text-[clamp(2rem,1rem+3.3vw,4.35rem)] leading-[1.14]">
          {text}
        </p>
      </div>
    </section>
  );
}
