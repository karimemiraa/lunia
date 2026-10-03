"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/site/LocaleSwitcher";

interface SereneHeaderProps {
  locale: string;
}

const NAV = [
  { key: "about", path: "about" },
  { key: "services", path: "services" },
  { key: "brands", path: "brands" },
  { key: "results", path: "results" },
  { key: "journal", path: "journal" },
  { key: "contact", path: "contact" },
] as const;

// The Serene Edition's bespoke header: airy and transparent at the top, then
// it morphs into a floating glass pill as you scroll. The logo is a bright
// teal medallion + wordmark; nav links have animated underlines; the mobile
// menu is a full-screen overlay whose links stagger in. Fully distinct from
// the main site's solid dark bar.
export function SereneHeader({ locale }: SereneHeaderProps) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const raf = useRef(0);
  const home = `/${locale}/v2`;
  const href = (p: string) => `/${locale}/${p}`;

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => setScrolled(window.scrollY > 24));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  // Lock body scroll + close on Escape while the mobile menu is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Brand = (
    <Link href={home} aria-label={t("home")} className="srn-brand">
      <span aria-hidden="true" className="srn-medallion">
        <span className="lunia-emblem" />
      </span>
      <span role="img" aria-label="LUNIA — Skin & Hair" className="srn-wordmark lunia-logo" />
    </Link>
  );

  return (
    <>
      <header className="srn-head" data-scrolled={scrolled}>
        <div className="srn-head-inner srn-head-enter">
          {Brand}

          <nav aria-label={t("primaryLabel")} className="hidden items-center gap-7 lg:flex">
            {NAV.map((item) => (
              <Link key={item.key} href={href(item.path)} className="srn-navlink">
                {t(item.key)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href={href("account")} className="srn-navlink hidden sm:inline-flex">
              {t("account")}
            </Link>
            <Link href={href("book")} data-magnetic className="lx-pill px-5 py-2.5 text-[0.85rem]">
              {t("book")}
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={tc("menu")}
              aria-expanded={open}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/8 lg:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true">
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Full-screen mobile menu */}
      <div className="srn-overlay lg:hidden" data-open={open} role="dialog" aria-modal="true" aria-label={t("mobileLabel")}>
        <div className="flex items-center justify-between">
          <span className="srn-medallion"><span aria-hidden="true" className="lunia-emblem" /></span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={tc("close")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-on-teal)] transition-colors hover:bg-black/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <nav aria-label={t("mobileLabel")} className="mt-[8svh] flex flex-1 flex-col justify-center gap-5">
          {[{ key: "home", path: "v2" }, ...NAV, { key: "account", path: "account" }].map((item) => (
            <Link key={item.key} href={href(item.path)} onClick={() => setOpen(false)} className="srn-overlay-link">
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t border-white/25 pt-6">
          <LocaleSwitcher
            locale={locale}
            className="rounded-sm text-sm font-medium text-[var(--color-on-teal)] underline-offset-4 hover:underline"
          />
          <Link href={href("book")} onClick={() => setOpen(false)} className="lx-pill lx-pill-ink px-6 py-3 text-sm">
            {t("book")}
          </Link>
        </div>
      </div>
    </>
  );
}
