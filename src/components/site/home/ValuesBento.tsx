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
          <article data-reveal className="lx-tile flex min-h-[34rem] flex-col justify-end bg-[#3a4450] p-8 sm:p-10 lg:col-span-7 lg:row-span-2 lg:min-h-[30rem] lg:justify-start">
            <div className="lx-tile-media">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
              <img src="/media/purity.webp" alt="" loading="lazy" decoding="async" className="object-[50%_0%] rtl:-scale-x-100 lg:object-[50%_30%]" />
            </div>
            {/* Copy sits at the bottom on phones (keeps the falling drop clear), top on desktop. */}
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-[1] h-3/5 bg-gradient-to-t from-[#1d2630]/90 via-[#1d2630]/55 to-transparent lg:bottom-auto lg:top-0 lg:h-1/2 lg:bg-gradient-to-b lg:from-[#1d2630]/70 lg:via-transparent" />
            <h3 className="lx-display lx-h3 text-white">{purity.title}</h3>
            <p className="mt-3 max-w-sm text-[1.05rem] leading-relaxed text-white/80 lg:max-w-[18.5rem]">{purity.body}</p>
          </article>

          {/* Mastery — textured tile */}
          <article data-reveal className="lx-tile flex min-h-[20rem] flex-col p-8 sm:p-10 lg:col-span-5">
            <div className="lx-tile-media">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
              <img src="/media/textures.webp" alt="" loading="lazy" decoding="async" className="object-[50%_75%]" />
            </div>
            <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-[1] h-3/4 bg-gradient-to-b from-[#f7efe6] via-[#f7efe6]/75 to-transparent" />
            <h3 className="lx-display lx-h3 text-[var(--color-ink)]">{mastery.title}</h3>
            <p className="mt-3 max-w-sm text-[1.05rem] leading-relaxed text-[var(--color-ink)]/75">{mastery.body}</p>
          </article>

          {/* Revelation — dark film tile */}
          <article data-reveal className="lx-tile flex min-h-[20rem] flex-col justify-end bg-[var(--color-forest)] p-8 sm:p-10 lg:col-span-5">
            <div className="lx-tile-media">
              <video data-inview-play muted loop playsInline preload="none" poster="/media/ritual.jpg" aria-hidden="true" className="object-[50%_32%]">
                <source src="/media/ritual.mp4" type="video/mp4" />
              </video>
            </div>
            <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-gradient-to-t from-[#12231f]/85 via-[#12231f]/25 to-transparent" />
            <h3 className="lx-display lx-h3 text-[var(--color-cream)]">{revelation.title}</h3>
            <p className="mt-3 max-w-sm text-[1.05rem] leading-relaxed text-[var(--color-cream)]/80">{revelation.body}</p>
          </article>

          {/* Counters */}
          {stats.map((s) => (
            <article
              key={s.label}
              data-reveal
              className="lx-tile flex min-h-[13rem] flex-col justify-between p-7 sm:p-8 lg:col-span-3 lg:min-h-0"
            >
              <span className="lx-stat text-[var(--color-teal-ink)]">
                <span data-count={s.value} data-count-suffix={s.suffix ?? ""}>
                  {s.value}
                  {s.suffix ?? ""}
                </span>
              </span>
              <span className="mt-6 text-[0.98rem] leading-snug text-[var(--color-ink)]/65">{s.label}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
