"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface HeaderBrandProps {
  href: string;
  label: string;
  className?: string;
}

// The adaptive brand lockup in the header: the emblem + wordmark at the top of
// the page, condensing to just the emblem once you scroll into the content —
// a small, premium micro-interaction. The glow star twinkles (CSS) and the
// mark blooms softly on hover. Painted in --logo-color (the primary teal).
export function HeaderBrand({ href, label, className = "" }: HeaderBrandProps) {
  const [condensed, setCondensed] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => setCondensed(window.scrollY > 72));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <Link href={href} aria-label={label} data-condensed={condensed} className={`lunia-brand ${className}`}>
      <span aria-hidden="true" className="lunia-emblem h-7 md:h-8" />
      <span role="img" aria-label="LUNIA — Skin & Hair" className="lunia-brand-word lunia-logo h-[1.375rem] md:h-[1.6rem]" />
    </Link>
  );
}
