"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger this element's entrance, in ms. */
  delay?: number;
  /** Render as a different element (default div). */
  as?: ElementType;
  className?: string;
}

// Scroll-reveal wrapper: adds `.is-visible` (see globals.css `.lunia-reveal`)
// the first time the element scrolls into view, then disconnects. Purely
// additive — content is fully readable without JS, and prefers-reduced-motion
// short-circuits the transition in CSS. No animation library, so nothing new
// ships to the bundle and the CSP stays untouched.
export function Reveal({ children, delay = 0, as: Tag = "div", className = "" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // If IntersectionObserver is unavailable, reveal immediately.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`lunia-reveal ${visible ? "is-visible" : ""} ${className}`.trim()}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
