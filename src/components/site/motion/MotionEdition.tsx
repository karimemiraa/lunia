"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Chevron } from "@/components/site/home/AppleHero";

export interface MotionPanel {
  name: string;
  tagline: string;
  href: string;
  src: string;
}
interface MotionStat {
  value: number;
  suffix?: string;
  label: string;
}
interface MotionEditionProps {
  headline: string;
  eyebrow: string;
  heroCaption: string;
  heroVideo: { src: string; mobileSrc: string; poster: string };
  panels: MotionPanel[];
  statement: string;
  stats: MotionStat[];
  marquee: string[];
  bookHref: string;
  labels: { book: string; explore: string; scroll: string; journey: string };
}

// Split a string into word/char spans so GSAP can stagger characters in (no
// SplitText plugin needed). Spaces are preserved as non-animated gaps.
function Kinetic({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, w) => (
        <span key={w} className="mo-word">
          {word.split("").map((ch, c) => (
            <span key={c} className="mo-char">
              {ch}
            </span>
          ))}
          {w < text.split(" ").length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

// The Motion Edition: brand-flagship scroll choreography. A kinetic full-bleed
// hero, a pinned HORIZONTAL journey track (the signature move), a scrubbed
// statement, a running marquee and count-up stats. Built on GSAP ScrollTrigger
// + Lenis, scoped and fully cleaned up. Progressive + reduced-motion safe: the
// markup is a readable vertical page if JS/motion is unavailable.
export function MotionEdition(p: MotionEditionProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cleanup: (() => void) | undefined;
    let killed = false;

    (async () => {
      const [{ default: Lenis }, gsapMod, stMod] = await Promise.all([
        import("lenis"),
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (killed) return;
      const gsap = gsapMod.default ?? gsapMod;
      const ScrollTrigger = stMod.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      const ticker = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(ticker);
      gsap.ticker.lagSmoothing(0);

      const q = gsap.utils.selector(el);
      const ctx = gsap.context(() => {
        // 1) Kinetic hero headline: characters rise in on load.
        gsap.from(q(".mo-char"), { yPercent: 115, duration: 1, ease: "expo.out", stagger: 0.012, delay: 0.1 });
        gsap.from(q(".mo-hero-cue"), { opacity: 0, y: 10, duration: 0.8, delay: 0.6 });

        // 2) Hero media parallax (slow drift behind the type).
        gsap.to(q(".mo-hero-media"), {
          yPercent: 16, ease: "none",
          scrollTrigger: { trigger: q(".mo-hero")[0], start: "top top", end: "bottom top", scrub: true },
        });

        // 3) Pinned HORIZONTAL journey track (desktop/tablet only — mobile keeps
        //    the safe vertical stack per the skill's pin guidance).
        const wrap = q(".mo-track-wrap")[0] as HTMLElement | undefined;
        const track = q(".mo-track")[0] as HTMLElement | undefined;
        const fill = q(".mo-rail-fill")[0] as HTMLElement | undefined;
        if (wrap && track && window.innerWidth >= 768) {
          track.classList.add("mo-horizontal");
          const distance = () => track.scrollWidth - window.innerWidth;
          gsap.to(track, {
            x: () => -distance(),
            ease: "none",
            scrollTrigger: {
              trigger: wrap,
              start: "top top",
              end: () => "+=" + distance(),
              pin: true,
              scrub: 1,
              invalidateOnRefresh: true,
              onUpdate: (self) => { if (fill) fill.style.transform = `scaleX(${self.progress})`; },
            },
          });
        }

        // 4) Scrubbed statement: words brighten as you scroll through the pin.
        const stmt = q(".mo-statement")[0] as HTMLElement | undefined;
        if (stmt) {
          gsap.fromTo(q(".mo-statement .mo-char"),
            { opacity: 0.16 },
            { opacity: 1, ease: "none", stagger: 0.5,
              scrollTrigger: { trigger: stmt, start: "top 80%", end: "bottom 60%", scrub: true } });
        }

        // 5) Marquee loop.
        const marquee = q(".mo-marquee-inner")[0] as HTMLElement | undefined;
        if (marquee) gsap.to(marquee, { xPercent: -50, duration: 24, ease: "none", repeat: -1 });

        // 6) Count-up stats.
        q(".mo-stat-num").forEach((node) => {
          const target = Number((node as HTMLElement).dataset.to || "0");
          const suffix = (node as HTMLElement).dataset.suffix || "";
          const dp = Number.isInteger(target) ? 0 : 1;
          const obj = { v: 0 };
          gsap.to(obj, {
            v: target, duration: 1.6, ease: "power2.out",
            scrollTrigger: { trigger: node as HTMLElement, start: "top 85%", once: true },
            onUpdate: () => { (node as HTMLElement).textContent = obj.v.toFixed(dp) + suffix; },
          });
        });

        // 7) Generic reveals.
        q("[data-mo-reveal]").forEach((node) => {
          gsap.from(node as HTMLElement, {
            opacity: 0, y: 32, duration: 0.7, ease: "power3.out",
            scrollTrigger: { trigger: node as HTMLElement, start: "top 86%" },
          });
        });

        ScrollTrigger.refresh();
      }, el);

      cleanup = () => { ctx.revert(); gsap.ticker.remove(ticker); lenis.destroy(); };
    })();

    return () => { killed = true; cleanup?.(); };
  }, []);

  return (
    <div ref={root}>
      {/* 1 — Kinetic full-bleed hero */}
      <section className="mo-hero">
        <div className="mo-hero-media" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- poster decoration behind the video */}
          <video autoPlay muted loop playsInline preload="metadata" poster={p.heroVideo.poster}>
            <source src={p.heroVideo.mobileSrc} type="video/mp4" media="(max-width: 767px)" />
            <source src={p.heroVideo.src} type="video/mp4" />
          </video>
        </div>
        <div className="mo-hero-scrim" aria-hidden="true" />
        <div className="mx-auto w-full max-w-7xl px-5 pb-[14svh] sm:px-6">
          <span className="mb-5 inline-flex items-center gap-2 text-[0.8rem] font-semibold uppercase tracking-[0.28em] text-[var(--color-cream)]/80">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {p.eyebrow}
          </span>
          <h1 className="mo-kinetic max-w-5xl">
            <Kinetic text={p.headline} />
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href={p.bookHref} className="lx-pill px-7 py-3.5 text-[0.95rem]">{p.labels.book}</Link>
            <span className="mo-hero-cue inline-flex items-center gap-2 text-sm text-[var(--color-cream)]/70">
              <span className="inline-block h-9 w-[1.5px] bg-[var(--color-cream)]/50" />
              {p.labels.scroll}
            </span>
          </div>
        </div>
      </section>

      {/* 2 — Pinned horizontal journey track */}
      <div className="bg-[var(--color-page)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 pb-6 pt-[clamp(3rem,8svh,5rem)] sm:px-6">
          <h2 className="lx-display lx-h2 text-[var(--color-ink)]" data-mo-reveal>{p.labels.journey}</h2>
          <div className="mo-rail hidden w-40 rounded-full md:block" aria-hidden="true"><span className="mo-rail-fill block rounded-full" /></div>
        </div>
        <div className="mo-track-wrap">
          <div className="mo-track">
            {p.panels.map((panel) => (
              <article key={panel.name} className="mo-panel">
                <div className="mo-panel-media" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
                  <img src={panel.src} alt="" loading="lazy" decoding="async" />
                </div>
                <div className="mo-panel-scrim" aria-hidden="true" />
                <div className="relative w-full max-w-7xl px-6 pb-[12svh] sm:px-10">
                  <h3 className="lx-display text-[clamp(2.4rem,1.6rem+3vw,4.5rem)] leading-[1.02] text-[var(--color-cream)]">{panel.name}</h3>
                  <p className="mt-4 max-w-md text-[1.05rem] leading-relaxed text-[var(--color-cream)]/80">{panel.tagline}</p>
                  <Link href={panel.href} className="lx-pill lx-pill-ink mt-7 px-6 py-3 text-[0.9rem]">
                    {p.labels.explore}
                    <Chevron />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* 3 — Scrubbed statement */}
      <section className="mo-statement lunia-teal-field lunia-pattern-mosaic lunia-pattern-multiply relative px-6">
        <p className="mo-kinetic !text-[var(--color-ink)]" style={{ fontSize: "clamp(2rem,1rem+4vw,5rem)", maxWidth: "60rem" }}>
          <Kinetic text={p.statement} />
        </p>
      </section>

      {/* 4 — Marquee */}
      <section className="mo-marquee border-y border-[var(--line)] bg-[var(--color-page)] py-8">
        <div className="mo-marquee-inner">
          {[...p.marquee, ...p.marquee].map((word, i) => (
            <span key={i} className="mo-marquee-item">
              {word}
              <span aria-hidden="true" className="lunia-glow-mark text-[var(--color-teal)]" />
            </span>
          ))}
        </div>
      </section>

      {/* 5 — Stats + CTA */}
      <section className="mx-auto w-full max-w-7xl px-5 py-[clamp(4rem,10svh,7rem)] sm:px-6">
        <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {p.stats.map((s) => (
            <div key={s.label} data-mo-reveal className="flex flex-col">
              <dd className="mo-stat-num lx-display text-[clamp(2.6rem,1.8rem+2.4vw,4.4rem)] leading-none text-[var(--color-teal-ink)]" data-to={s.value} data-suffix={s.suffix ?? ""}>
                {Number.isInteger(s.value) ? "0" : "0.0"}{s.suffix ?? ""}
              </dd>
              <dt className="mt-3 text-[0.9rem] leading-snug text-[var(--color-ink)]/60">{s.label}</dt>
            </div>
          ))}
        </dl>
        <div data-mo-reveal className="mt-14 flex flex-col items-center gap-6 rounded-[2.5rem] bg-[var(--color-ink)] px-6 py-[clamp(3rem,8svh,5rem)] text-center">
          <h2 className="lx-display lx-h2 text-[var(--color-on-ink)]">{p.statement}</h2>
          <Link href={p.bookHref} className="lx-pill px-8 py-4 text-base">{p.labels.book}</Link>
        </div>
      </section>
    </div>
  );
}
