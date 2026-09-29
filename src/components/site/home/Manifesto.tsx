interface ManifestoProps {
  id?: string;
  eyebrow: string;
  text: string;
}

// The brand philosophy as one large statement whose words light up as you read
// (Apple's scroll-highlight, scrubbed by CinematicScroll's [data-highlight]).
// It sits on the Luminous Teal field — the brand's primary color — with a slow
// water film blended into the teal ("luminosity"), so the "fluid waves" of the
// brand pattern move under the words without ever darkening the page. Ink
// type, as the guidelines reserve deep teal shades for text. Without JS every
// word is simply shown at full strength.
export function Manifesto({ id, eyebrow, text }: ManifestoProps) {
  return (
    <section
      id={id}
      className="lunia-teal-field relative isolate scroll-mt-16 overflow-clip py-[20svh]"
    >
      <video
        data-inview-play
        muted
        loop
        playsInline
        preload="none"
        poster="/media/water.jpg"
        aria-hidden="true"
        width={1920}
        height={1080}
        className="absolute inset-0 -z-20 h-full w-full object-cover opacity-[0.28] mix-blend-luminosity"
      >
        <source src="/media/water.mp4" type="video/mp4" />
      </video>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,var(--color-teal)_0%,transparent_30%,transparent_70%,var(--color-alice)_100%)] opacity-70"
      />

      <div className="mx-auto w-full max-w-5xl px-6">
        <span className="lx-eyebrow text-[var(--color-teal-ink)]">
          <span aria-hidden="true" className="lunia-glow-mark" />
          {eyebrow}
        </span>
        <p data-highlight className="lx-highlight lx-highlight-light lx-display mt-8 text-[clamp(2rem,1rem+3.3vw,4.35rem)] leading-[1.14]">
          {text}
        </p>
      </div>
    </section>
  );
}
