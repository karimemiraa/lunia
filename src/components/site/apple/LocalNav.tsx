import Link from "next/link";

interface LocalNavLink {
  href: string;
  label: string;
}

interface LocalNavProps {
  title: string;
  titleHref?: string;
  links?: LocalNavLink[];
  cta?: LocalNavLink;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

// Apple's per-page sub-navigation: a slim glass bar that sticks just under the
// global header — the page title on the inline-start, in-page section links and
// a small pill CTA on the inline-end. Section links collapse on phones, where
// the title + CTA remain.
export function LocalNav({ title, titleHref, links = [], cta }: LocalNavProps) {
  const titleClass = `lx-display truncate rounded-sm text-[1.3rem] leading-none text-[var(--color-ink)] ${focusRing}`;
  return (
    <nav
      aria-label={title}
      className="sticky top-16 z-30 border-b border-[var(--color-ink)]/[0.07] bg-[var(--color-page)]/78 backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:px-6">
        {titleHref ? (
          <Link href={titleHref} className={titleClass}>
            {title}
          </Link>
        ) : (
          <span className={titleClass}>{title}</span>
        )}
        <div className="flex shrink-0 items-center gap-6">
          {links.length > 0 && (
            <ul className="hidden items-center gap-6 md:flex">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className={`rounded-sm text-[0.78rem] text-[var(--color-ink)]/70 transition-colors hover:text-[var(--color-ink)] ${focusRing}`}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {cta && (
            <Link href={cta.href} className={`lx-pill px-3.5 py-1 text-[0.75rem] ${focusRing}`}>
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
