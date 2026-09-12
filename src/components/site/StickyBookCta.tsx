"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface StickyBookCtaProps {
  href: string;
  label: string;
}

// A persistent booking affordance that fades in once the visitor scrolls past
// the opening viewport (so it never competes with the hero's own CTA), then
// stays reachable in the corner for the rest of the page — the "always one tap
// from booking" pattern. Purely additive and reduced-motion friendly: it's a
// plain link with a CSS transition, and it self-hides at the very top of the
// page. Anchored to the inline-end so it mirrors correctly under RTL.
export function StickyBookCta({ href, label }: StickyBookCtaProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-5 z-40 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
      style={{ insetInlineEnd: "1.25rem" }}
    >
      <Link
        href={href}
        className="lunia-btn lunia-btn-primary flex items-center gap-2 px-6 py-3 text-sm shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
          <path d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z" />
        </svg>
        {label}
      </Link>
    </div>
  );
}
