"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// The site's cinematic motion engine — built to match the rivive.sa feel:
// Lenis smooth scrolling + GSAP ScrollTrigger, with EXPO easing, staggered
// scale/opacity reveals, skew + rotationX depth on text and cards, split-text
// headlines, clip-path image wipes, animated counters, and a pinned
// horizontal-scroll section on desktop.
//
// On init it adds `html.gsap-ready`, which switches OFF the older CSS
// scroll-timeline versions (globals.css) so nothing double-animates. Fully
// gated by prefers-reduced-motion; all content is in the SSR HTML and only its
// opacity/transform is animated, so no-JS and crawlers are unaffected.
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
                { opacity: 1, y: 0, duration: 1.0, ease: EXPO, stagger: 0.08, overwrite: true },
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

          // 10) Horizontal-scroll section (desktop only). NOT pinned — the card
          // track slides sideways as the section transits the viewport, so it
          // stays in normal document flow and can never overlap its neighbours.
          // (Pinning inside the flex <main> + page-transition wrapper caused the
          // sections above/below to overlap.) Mobile keeps a native swipe rail.
          const mm = gsap.matchMedia();
          mm.add("(min-width: 1024px)", () => {
            gsap.utils.toArray<HTMLElement>("[data-horizontal]").forEach((section) => {
              const track = section.querySelector<HTMLElement>("[data-horizontal-track]");
              if (!track) return;
              const distance = () => Math.max(0, track.scrollWidth - section.clientWidth + 48);
              gsap.fromTo(
                track,
                { x: 0 },
                {
                  x: () => -distance(),
                  ease: "none",
                  scrollTrigger: { trigger: section, start: "top 72%", end: "bottom top", scrub: 0.6, invalidateOnRefresh: true },
                },
              );
            });
          });

          return () => mm.revert();
        });

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
      cleanup?.();
    };
  }, [pathname]);

  return null;
}
