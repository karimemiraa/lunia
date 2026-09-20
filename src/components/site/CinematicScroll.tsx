"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// The site's cinematic motion engine. The public site already carries the
// intent classes (.lunia-scroll, .lunia-scroll-fade, .lunia-parallax, .cine,
// [data-splittext], [data-magnetic]) but drives them with CSS scroll-timeline,
// which only Chrome supports — so Safari/Firefox saw a static page. This client
// controller re-drives the same hooks with Lenis smooth scrolling + GSAP
// ScrollTrigger so the motion is buttery and identical on every browser.
//
// When it initializes it adds `html.gsap-ready`, which neutralizes the CSS
// scroll-timeline versions (see globals.css) so nothing double-animates. Fully
// gated by prefers-reduced-motion; content is always in the SSR HTML and only
// its opacity/position is animated, so no-JS and crawlers get everything.
export function CinematicScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
        const lenis = new Lenis({ duration: 1.1, wheelMultiplier: 1, smoothWheel: true });
        lenis.on("scroll", ScrollTrigger.update);
        const ticker = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(ticker);
        gsap.ticker.lagSmoothing(0);

        // --- Scroll progress bar ---
        const bar = document.createElement("div");
        bar.className = "lunia-progress-bar";
        document.body.appendChild(bar);
        ScrollTrigger.create({
          start: 0,
          end: "max",
          onUpdate: (self) => {
            bar.style.transform = `scaleX(${self.progress})`;
          },
        });

        const listeners: Array<() => void> = [];

        const ctx = gsap.context(() => {
          const EASE = "power3.out";

          // 1) Reveals — sections/headings lift & fade in, in staggered batches.
          ScrollTrigger.batch(".lunia-scroll, [data-reveal]", {
            start: "top 86%",
            onEnter: (els) =>
              gsap.fromTo(
                els,
                { opacity: 0, y: 34 },
                { opacity: 1, y: 0, duration: 0.9, ease: EASE, stagger: 0.09, overwrite: true },
              ),
          });

          // 2) Opacity-only reveal for cards/logos (transform stays free for hover).
          ScrollTrigger.batch(".lunia-scroll-fade", {
            start: "top 88%",
            onEnter: (els) =>
              gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: 1, ease: "power2.out", stagger: 0.06, overwrite: true }),
          });

          // 3) Split-text headline — words rise out of a mask, one after another.
          gsap.utils.toArray<HTMLElement>("[data-splittext]").forEach((el) => {
            const raw = el.textContent ?? "";
            if (!raw.trim()) return;
            el.textContent = "";
            el.classList.add("lunia-split");
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
            gsap.fromTo(
              el.querySelectorAll(".lunia-split-inner"),
              { yPercent: 118 },
              { yPercent: 0, duration: 1, ease: "power4.out", stagger: 0.09, delay: 0.15 },
            );
          });

          // 4) Parallax layers (e.g. the hero photo) drift as they scroll through.
          gsap.utils.toArray<HTMLElement>(".lunia-parallax, [data-parallax]").forEach((el) => {
            const host = el.closest("section") ?? el.parentElement ?? el;
            gsap.fromTo(
              el,
              { yPercent: -8, scale: 1.1 },
              {
                yPercent: 8,
                scale: 1.1,
                ease: "none",
                scrollTrigger: { trigger: host, start: "top bottom", end: "bottom top", scrub: true },
              },
            );
          });

          // 5) Cinematic image — the framed photo scales up to full-bleed and its
          // corners square off as you scroll through it; the caption fades in.
          gsap.utils.toArray<HTMLElement>(".cine").forEach((section) => {
            const frame = section.querySelector<HTMLElement>(".cine-frame");
            const caption = section.querySelector<HTMLElement>(".cine-caption");
            if (frame) {
              gsap.fromTo(
                frame,
                { scale: 0.82, borderRadius: "2rem" },
                {
                  scale: 1,
                  borderRadius: "0rem",
                  ease: "none",
                  scrollTrigger: { trigger: section, start: "top 80%", end: "bottom bottom", scrub: 0.4 },
                },
              );
            }
            if (caption) {
              gsap.fromTo(
                caption,
                { opacity: 0, y: 30 },
                { opacity: 1, y: 0, ease: "power2.out", scrollTrigger: { trigger: section, start: "top 45%" } },
              );
            }
          });

          // 6) Magnetic buttons — gently pull toward the cursor (desktop only).
          if (window.matchMedia("(pointer: fine)").matches) {
            gsap.utils.toArray<HTMLElement>("[data-magnetic]").forEach((el) => {
              const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
              const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
              const onMove = (e: MouseEvent) => {
                const r = el.getBoundingClientRect();
                xTo((e.clientX - (r.left + r.width / 2)) * 0.35);
                yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
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
        });

        // Recalculate once fonts/images settle.
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
        // On any failure, make sure the CSS fallback shows everything.
        document.documentElement.classList.remove("gsap-ready");
      }
    })();

    return () => {
      killed = true;
      cleanup?.();
    };
  }, [pathname]);

  return null;
}
