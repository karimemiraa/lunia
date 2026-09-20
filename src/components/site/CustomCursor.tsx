"use client";

import { useEffect } from "react";

// A subtle, premium custom cursor for desktop pointers: a small filled dot that
// tracks exactly, and a larger ring that trails with easing and swells over
// interactive elements. Pointer-events-none so it never blocks clicks. Only
// mounts on fine pointers (real mouse) that don't prefer reduced motion — touch
// devices and keyboard/reduced-motion users keep the native cursor untouched.
export function CustomCursor() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cleanup: (() => void) | null = null;
    let killed = false;

    (async () => {
      const gsapMod = await import("gsap");
      if (killed) return;
      const gsap = gsapMod.gsap ?? gsapMod.default;

      const dot = document.createElement("div");
      dot.className = "lunia-cursor-dot";
      const ring = document.createElement("div");
      ring.className = "lunia-cursor-ring";
      document.body.appendChild(dot);
      document.body.appendChild(ring);
      document.documentElement.classList.add("has-custom-cursor");

      const dotX = gsap.quickTo(dot, "x", { duration: 0.15, ease: "power3.out" });
      const dotY = gsap.quickTo(dot, "y", { duration: 0.15, ease: "power3.out" });
      const ringX = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3.out" });
      const ringY = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3.out" });

      let shown = false;
      const onMove = (e: MouseEvent) => {
        if (!shown) {
          shown = true;
          gsap.to([dot, ring], { opacity: 1, duration: 0.3 });
        }
        dotX(e.clientX);
        dotY(e.clientY);
        ringX(e.clientX);
        ringY(e.clientY);
      };
      const interactive = "a, button, [role='button'], input, textarea, select, [data-magnetic]";
      const onOver = (e: MouseEvent) => {
        if ((e.target as HTMLElement)?.closest?.(interactive)) ring.classList.add("is-active");
      };
      const onOut = (e: MouseEvent) => {
        if ((e.target as HTMLElement)?.closest?.(interactive)) ring.classList.remove("is-active");
      };
      const onLeaveWindow = () => gsap.to([dot, ring], { opacity: 0, duration: 0.2 });

      window.addEventListener("mousemove", onMove);
      document.addEventListener("mouseover", onOver);
      document.addEventListener("mouseout", onOut);
      document.addEventListener("mouseleave", onLeaveWindow);

      cleanup = () => {
        window.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseover", onOver);
        document.removeEventListener("mouseout", onOut);
        document.removeEventListener("mouseleave", onLeaveWindow);
        dot.remove();
        ring.remove();
        document.documentElement.classList.remove("has-custom-cursor");
      };
    })();

    return () => {
      killed = true;
      cleanup?.();
    };
  }, []);

  return null;
}
