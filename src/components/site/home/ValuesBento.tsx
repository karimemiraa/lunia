interface ValueCopy {
  title: string;
  body: string;
}

interface Stat {
  value: number;
  suffix?: string;
  label: string;
}

interface ValuesBentoProps {
  eyebrow: string;
  heading: string;
  intro: string;
  purity: ValueCopy;
  mastery: ValueCopy;
  revelation: ValueCopy;
  stats: Stat[];
}

// The brand's three values (Purity, Mastery, Revelation — from the Lunia brand
// guidelines) as an Apple-style bento: one tall image-led tile, a textured
// tile, a dark film tile, then a row of counters. Tiles lift in as they enter
// ([data-reveal]) and their media eases in on hover.
export function ValuesBento({ eyebrow, heading, intro, purity, mastery, revelation, stats }: ValuesBentoProps) {
  return (
    <section className="bg-[var(--color-page)] py-[clamp(6rem,14svh,10rem)]">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-6">
        <header className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="lx-eyebrow lunia-scroll">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {eyebrow}
          </span>
          <h2 data-splittext className="lx-display lx-h2 mt-5 text-[var(--color-ink)]">
            {heading}
          </h2>
          <p className="lx-lead lunia-scroll mt-6 max-w-2xl">{intro}</p>
        </header>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:gap-5 lg:mt-20 lg:grid-cols-12 lg:auto-rows-[minmax(18rem,auto)]">
          {/* Purity — tall image tile */}
          <article data-reveal className="lx-tile flex min-h-[34rem] flex-col justify-end bg-[var(--color-forest)] p-8 sm:p-10 lg:col-span-7 lg:row-span-2 lg:min-h-[30rem] lg:justify-start">
            <div className="lx-tile-media">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
              <img src="/media/purity.webp" alt="" width={1200} height={1600} loading="lazy" decoding="async" className="object-[50%_0%] rtl:-scale-x-100 lg:object-[50%_30%]" />
            </div>
            {/* Copy sits at the bottom on phones (keeps the falling drop clear), top on desktop. */}
            <div aria-hidden="true" className="lx-photo-scrim absolute inset-x-0 bottom-0 -z-[1] h-3/5 lg:hidden" />
            <div aria-hidden="true" className="lx-photo-scrim-top absolute inset-x-0 top-0 -z-[1] hidden h-1/2 lg:block" />
            <h3 className="lx-display lx-h3 text-[var(--color-cream)]">{purity.title}</h3>
            <p className="mt-3 max-w-sm text-[1.05rem] leading-relaxed text-[var(--color-cream)]/85 lg:max-w-[18.5rem]">{purity.body}</p>
          </article>

          {/* Mastery — textured tile */}
          <article data-reveal className="lx-tile flex min-h-[20rem] flex-col p-8 sm:p-10 lg:col-span-5">
            <div className="lx-tile-media">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
              <img src="/media/textures.webp" alt="" width={1200} height={800} loading="lazy" decoding="async" className="object-[50%_75%]" />
            </div>
            {/* The wash is a theme token (cream in Luminous, ink in Midnight, frosted in Aurora) so the copy always sits on its own ground. */}
            <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-[1] h-3/4 bg-[linear-gradient(to_bottom,var(--tile-wash)_0%,var(--tile-wash)_45%,transparent_100%)]" />
            <h3 className="lx-display lx-h3 text-[var(--color-ink)]">{mastery.title}</h3>
            <p className="mt-3 max-w-sm text-[1.05rem] leading-relaxed text-[var(--color-ink)]/75">{mastery.body}</p>
          </article>

          {/* Revelation — film tile, washed in deep teal */}
          <article data-reveal className="lx-tile flex min-h-[20rem] flex-col justify-end bg-[var(--color-alice)] p-8 sm:p-10 lg:col-span-5">
            <div className="lx-tile-media">
              <video data-inview-play muted loop playsInline preload="none" poster="/media/ritual.jpg" aria-hidden="true" width={1280} height={720} className="object-[50%_32%]">
                <source src="/media/ritual.mp4" type="video/mp4" />
              </video>
            </div>
            <div aria-hidden="true" className="lx-photo-scrim absolute inset-0 -z-[1]" />
            <h3 className="lx-display lx-h3 text-[var(--color-cream)]">{revelation.title}</h3>
            <p className="mt-3 max-w-sm text-[1.05rem] leading-relaxed text-[var(--color-cream)]/80">{revelation.body}</p>
          </article>

          {/* Counters */}
          {stats.map((s, i) => (
            <article
              key={s.label}
              data-reveal
              // The first counter sits on the Luminous Teal field so the
              // brand color anchors the grid; the rest stay white.
              className={`lx-tile flex min-h-[13rem] flex-col justify-between p-7 sm:p-8 lg:col-span-3 lg:min-h-0 ${
                i === 0 ? "lunia-teal-field lunia-pattern-mosaic lunia-pattern-multiply" : ""
              }`}
            >
              <span className="lx-stat text-[var(--color-teal-ink)]">
                <span data-count={s.value} data-count-suffix={s.suffix ?? ""}>
                  {s.value}
                  {s.suffix ?? ""}
                </span>
              </span>
              <span className="mt-6 text-[0.98rem] leading-snug text-[var(--color-ink)]/75">{s.label}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
