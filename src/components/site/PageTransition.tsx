"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";

// GSAP-driven page transition for the public site: on every route change the
// content gently fades and rises in, with its top-level sections staggered a
// touch for a "settling" feel. Fully gated by prefers-reduced-motion — those
// users see the content immediately with no motion. The content is always in
// the SSR HTML (only its opacity/position is animated), so no-JS and crawlers
// still get everything.
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const sections = el.querySelectorAll(":scope > *");
      gsap.fromTo(
        sections.length ? sections : el,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.55, ease: "power2.out", stagger: 0.08, clearProps: "opacity,transform" },
      );
    }, el);

    return () => ctx.revert();
  }, [pathname]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
