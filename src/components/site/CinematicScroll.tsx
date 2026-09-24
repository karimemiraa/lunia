"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// The site's cinematic motion engine: Lenis smooth scrolling + GSAP
// ScrollTrigger with EXPO easing — staggered reveals, split-text headlines,
// clip-path image wipes, animated counters, and the Apple-style homepage
// chapters (film-stage hero, scroll-highlight statement, sticky stepper).
// Sections are CSS-sticky and GSAP only scrubs transforms/classes, so nothing
// is pinned and no section can overlap its neighbours.
//
// On init it adds `html.gsap-ready`, which switches OFF the older CSS
// scroll-timeline versions (globals.css) so nothing double-animates. Fully
// gated by prefers-reduced-motion; all content is in the SSR HTML and only its
// opacity/transform is animated, so no-JS and crawlers are unaffected.
export function CinematicScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Reduced motion: no scroll choreography, and no ambient autoplaying
      // film — every video rests on its poster frame.
      document.querySelectorAll<HTMLVideoElement>("video[autoplay]").forEach((v) => v.pause());
      return;
    }

    // React doesn't serialize `muted` into the server HTML, so browsers treat
    // SSR'd autoplay films as unmuted and refuse to start them. Mute + start
    // them explicitly once we're on the client.
    document.querySelectorAll<HTMLVideoElement>("video[autoplay]").forEach((v) => {
      v.muted = true;
      v.play().catch(() => {});
    });

    // Browsers suspend muted films while the tab is hidden; when the visitor
    // comes back, resume the ones that should be playing (autoplay films, the
    // active stepper film, and on-screen ambient films that have loaded).
    const onVisible = () => {
      if (document.hidden) return;
      const selector = "video[autoplay], video[data-inview-play], [data-step-media].is-active video";
      document.querySelectorAll<HTMLVideoElement>(selector).forEach((v) => {
        if (!v.paused) return;
        const r = v.getBoundingClientRect();
        const onScreen = r.bottom > 0 && r.top < window.innerHeight;
        if (v.autoplay || (onScreen && v.preload !== "none")) {
          v.muted = true;
          v.play().catch(() => {});
        }
      });
    };
    document.addEventListener("visibilitychange", onVisible);

    let cleanup: (() => void) | null = null;
    let killed = false;

    (async () => {
      try {
        const [{ default: Lenis }, gsapMod, stMod] = await Promise.all([
          import("lenis"),
          import("gsap"),
          import("gsap/ScrollTrigger"),
        ]);
        if (killed) return;
        const gsap = gsapMod.gsap ?? gsapMod.default;
        const ScrollTrigger = stMod.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);

        const root = document.documentElement;
        root.classList.add("gsap-ready");

        // --- Lenis smooth scroll, driven by GSAP's ticker ---
        const lenis = new Lenis({ duration: 1.15, wheelMultiplier: 1, smoothWheel: true });
        lenis.on("scroll", ScrollTrigger.update);
        const ticker = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(ticker);
        gsap.ticker.lagSmoothing(0);

        // --- Top scroll-progress bar (amber gradient) ---
        const bar = document.createElement("div");
        bar.className = "lunia-progress-bar";
        document.body.appendChild(bar);
        ScrollTrigger.create({ start: 0, end: "max", onUpdate: (s) => (bar.style.transform = `scaleX(${s.progress})`) });

        const listeners: Array<() => void> = [];

        const ctx = gsap.context(() => {
          const EXPO = "expo.out";

          // 1) Split-text headlines — words rise out of a mask with a slight
          // 3D tilt (rotationX), the signature rivive headline entrance.
          gsap.utils.toArray<HTMLElement>("[data-splittext]").forEach((el) => {
            const raw = el.textContent ?? "";
            if (!raw.trim()) return;
            el.textContent = "";
            el.style.perspective = "800px";
            const frag = document.createDocumentFragment();
            for (const word of raw.split(/(\s+)/)) {
              if (/^\s+$/.test(word)) {
                frag.appendChild(document.createTextNode(word));
                continue;
              }
              const outer = document.createElement("span");
              outer.className = "lunia-split-word";
              const inner = document.createElement("span");
              inner.className = "lunia-split-inner";
              inner.textContent = word;
              outer.appendChild(inner);
              frag.appendChild(outer);
            }
            el.appendChild(frag);
            gsap.from(el.querySelectorAll(".lunia-split-inner"), {
              yPercent: 120,
              rotationX: -75,
              opacity: 0,
              transformOrigin: "50% 100% -30px",
              duration: 1.15,
              ease: EXPO,
              stagger: 0.07,
              delay: 0.1,
              scrollTrigger: el.closest("section") ? { trigger: el, start: "top 90%" } : undefined,
            });
          });

          // 2) Standard reveals — a gentle lift + fade, EXPO, staggered. Kept
          // subtle (small travel, no scale-down) so long editorial rows settle
          // quickly and never feel like they "jump" as you scroll.
          ScrollTrigger.batch(".lunia-scroll, [data-reveal]", {
            start: "top 88%",
            onEnter: (els) =>
              gsap.fromTo(
                els,
                { opacity: 0, y: 40 },
                // clearProps hands transform back to CSS afterwards, so hover
                // lifts (cards, tiles) work once the reveal has settled.
                { opacity: 1, y: 0, duration: 1.0, ease: EXPO, stagger: 0.08, overwrite: true, clearProps: "transform" },
              ),
          });

          // 3) Card reveals — a clean lift + fade (no 3D flip/skew, which read
          // as janky on large image+text rows). Reserved for opt-in
          // .lunia-reveal-card elements.
          ScrollTrigger.batch(".lunia-reveal-card", {
            start: "top 88%",
            onEnter: (els) =>
              gsap.fromTo(
                els,
                { opacity: 0, y: 56 },
                { opacity: 1, y: 0, duration: 1.05, ease: EXPO, stagger: 0.1, overwrite: true },
              ),
          });

          // 4) Opacity-only reveal for logos (transform stays free for hover).
          ScrollTrigger.batch(".lunia-scroll-fade", {
            start: "top 90%",
            onEnter: (els) => gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: 1, ease: "power2.out", stagger: 0.05, overwrite: true }),
          });

          // 5) Clip-path image wipes — the frame unveils from the bottom up.
          gsap.utils.toArray<HTMLElement>(".lunia-clip, [data-clip]").forEach((el) => {
            gsap.fromTo(
              el,
              { clipPath: "inset(0% 0% 100% 0%)" },
              {
                clipPath: "inset(0% 0% 0% 0%)",
                duration: 1.4,
                ease: EXPO,
                scrollTrigger: { trigger: el, start: "top 85%" },
              },
            );
          });

          // 6) Parallax layers (hero photo etc.) drift as they scroll through.
          gsap.utils.toArray<HTMLElement>(".lunia-parallax, [data-parallax]").forEach((el) => {
            const host = el.closest("section") ?? el.parentElement ?? el;
            gsap.fromTo(
              el,
              { yPercent: -9, scale: 1.12 },
              { yPercent: 9, scale: 1.12, ease: "none", scrollTrigger: { trigger: host, start: "top bottom", end: "bottom top", scrub: true } },
            );
          });

          // 7) Cinematic image — scales to full-bleed + squares its corners as
          // you scroll through, caption fading up.
          gsap.utils.toArray<HTMLElement>(".cine").forEach((section) => {
            const frame = section.querySelector<HTMLElement>(".cine-frame");
            const caption = section.querySelector<HTMLElement>(".cine-caption");
            if (frame) {
              gsap.fromTo(
                frame,
                { scale: 0.8, borderRadius: "2.5rem" },
                { scale: 1, borderRadius: "0rem", ease: "none", scrollTrigger: { trigger: section, start: "top 80%", end: "bottom bottom", scrub: 0.4 } },
              );
            }
            if (caption) {
              gsap.fromTo(caption, { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 1.1, ease: EXPO, scrollTrigger: { trigger: section, start: "top 45%" } });
            }
          });

          // 8) Animated counters — count up from 0 to [data-count] on enter.
          gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
            const target = parseFloat(el.getAttribute("data-count") || "0");
            const suffix = el.getAttribute("data-count-suffix") ?? "";
            const dur = 2;
            const obj = { v: 0 };
            // SSR shows the final figure (no-JS); start from zero once we animate.
            el.textContent = `0${suffix}`;
            gsap.to(obj, {
              v: target,
              duration: dur,
              ease: "power2.out",
              scrollTrigger: { trigger: el, start: "top 88%" },
              onUpdate: () => {
                el.textContent = (Number.isInteger(target) ? Math.round(obj.v) : obj.v.toFixed(1)) + suffix;
              },
            });
          });

          // 9) Magnetic buttons (desktop pointers only).
          if (window.matchMedia("(pointer: fine)").matches) {
            gsap.utils.toArray<HTMLElement>("[data-magnetic]").forEach((el) => {
              const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "expo.out" });
              const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "expo.out" });
              const onMove = (e: MouseEvent) => {
                const r = el.getBoundingClientRect();
                xTo((e.clientX - (r.left + r.width / 2)) * 0.4);
                yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
              };
              const onLeave = () => {
                xTo(0);
                yTo(0);
              };
              el.addEventListener("mousemove", onMove);
              el.addEventListener("mouseleave", onLeave);
              listeners.push(() => {
                el.removeEventListener("mousemove", onMove);
                el.removeEventListener("mouseleave", onLeave);
              });
            });
          }

          // 10) Apple hero — the film stage rises from beneath the headline and
          // grows to full-bleed (scale + y + corner radius), the copy lifts
          // away, then a caption resolves over the film. Scrubbed across the
          // section's tall track while its viewport is CSS-sticky (no GSAP pin,
          // so nothing can overlap neighbouring sections).
          gsap.utils.toArray<HTMLElement>("[data-apple-hero]").forEach((section) => {
            const stage = section.querySelector<HTMLElement>("[data-hero-stage]");
            const copy = section.querySelector<HTMLElement>("[data-hero-copy]");
            const caption = section.querySelector<HTMLElement>("[data-hero-caption]");
            const shade = section.querySelector<HTMLElement>("[data-hero-shade]");
            if (!stage || !copy) return;
            const mobile = () => window.innerWidth < 768;
            const s0 = () => (mobile() ? 0.9 : 0.84);
            // Start the stage just under the copy (copy's offsetParent is the
            // sticky viewport), but always leave a generous slice of film.
            const y0 = () => Math.min(copy.offsetTop + copy.offsetHeight + (mobile() ? 28 : 44), window.innerHeight * 0.7);

            const tl = gsap.timeline({
              defaults: { ease: "none" },
              scrollTrigger: { trigger: section, start: "top top", end: "bottom bottom", scrub: 0.5, invalidateOnRefresh: true },
            });
            tl.fromTo(stage, { y: y0, scale: s0, borderRadius: () => 30 / s0() }, { y: 0, scale: 1, borderRadius: 0, duration: 0.72 }, 0)
              .to(copy, { y: () => -window.innerHeight * 0.14, opacity: 0, duration: 0.38 }, 0);
            if (shade) tl.fromTo(shade, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.6);
            if (caption) tl.fromTo(caption, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.2 }, 0.72);
            tl.to({}, { duration: 0.12 });
          });

          // 11) Scroll-highlight statement — each word brightens as the reader
          // reaches it (words are split once; color is toggled via a class so
          // it's a cheap, transition-smoothed repaint).
          gsap.utils.toArray<HTMLElement>("[data-highlight]").forEach((el) => {
            const raw = el.textContent ?? "";
            if (!raw.trim()) return;
            el.textContent = "";
            const words: HTMLElement[] = [];
            for (const part of raw.split(/(\s+)/)) {
              if (!part) continue;
              if (/^\s+$/.test(part)) {
                el.appendChild(document.createTextNode(part));
                continue;
              }
              const w = document.createElement("span");
              w.className = "lx-word";
              w.textContent = part;
              el.appendChild(w);
              words.push(w);
            }
            ScrollTrigger.create({
              trigger: el,
              start: "top 78%",
              end: "bottom 45%",
              scrub: true,
              onUpdate: (self) => {
                const lit = Math.round(self.progress * words.length);
                words.forEach((w, i) => w.classList.toggle("is-lit", i < lit));
              },
            });
          });

          // 12) Sticky stepper — as each step crosses the reading line it
          // becomes active: its copy brightens and the sticky media panel
          // crossfades to its film/photo. Only the active film plays, and only
          // while the section is on screen. A rail fills with progress.
          gsap.utils.toArray<HTMLElement>("[data-steps]").forEach((section) => {
            const steps = gsap.utils.toArray<HTMLElement>("[data-step]", section);
            const media = gsap.utils.toArray<HTMLElement>("[data-step-media]", section);
            let current = 0;
            let onScreen = false;
            const sync = () => {
              steps.forEach((s, k) => s.classList.toggle("is-active", k === current));
              media.forEach((m, k) => {
                m.classList.toggle("is-active", k === current);
                const v = m.querySelector("video");
                if (!v) return;
                if (k === current && onScreen) {
                  if (v.preload === "none") v.preload = "auto";
                  v.muted = true;
                  v.play().catch(() => {});
                } else v.pause();
              });
            };
            steps.forEach((s, i) =>
              ScrollTrigger.create({
                trigger: s,
                start: "top 62%",
                end: "bottom 62%",
                onToggle: (self) => {
                  if (self.isActive && current !== i) {
                    current = i;
                    sync();
                  }
                },
              }),
            );
            ScrollTrigger.create({
              trigger: section,
              start: "top bottom",
              end: "bottom top",
              onToggle: (self) => {
                onScreen = self.isActive;
                sync();
              },
            });
            sync();
            const list = section.querySelector("[data-steps-list]");
            const bar = section.querySelector("[data-steps-progress]");
            if (list && bar) {
              gsap.fromTo(bar, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: list, start: "top 62%", end: "bottom 62%", scrub: true } });
            }
          });
        });

        // Ambient films play only while on screen (saves battery + bandwidth;
        // preload="none" films start fetching as they approach).
        const io = new IntersectionObserver(
          (entries) =>
            entries.forEach((e) => {
              const v = e.target as HTMLVideoElement;
              if (e.isIntersecting) {
                if (v.preload === "none") v.preload = "auto";
                v.muted = true;
                v.play().catch(() => {});
              } else v.pause();
            }),
          { rootMargin: "200px 0px" },
        );
        document.querySelectorAll<HTMLVideoElement>("video[data-inview-play]").forEach((v) => io.observe(v));
        listeners.push(() => io.disconnect());

        ScrollTrigger.refresh();
        const onLoad = () => ScrollTrigger.refresh();
        window.addEventListener("load", onLoad);

        cleanup = () => {
          window.removeEventListener("load", onLoad);
          for (const off of listeners) off();
          ctx.revert();
          ScrollTrigger.getAll().forEach((t) => t.kill());
          gsap.ticker.remove(ticker);
          lenis.destroy();
          bar.remove();
          root.classList.remove("gsap-ready");
        };
      } catch {
        document.documentElement.classList.remove("gsap-ready");
      }
    })();

    return () => {
      killed = true;
      document.removeEventListener("visibilitychange", onVisible);
      cleanup?.();
    };
  }, [pathname]);

  return null;
}
