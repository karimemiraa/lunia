import Link from "next/link";

interface BrandLogo {
  name: string;
  href: string;
  /** MediaAsset.storageKey for the brand logo, if uploaded. */
  logoKey?: string | null;
}

interface BrandLogosProps {
  brands: BrandLogo[];
}

function BrandItem({ brand, ariaHidden }: { brand: BrandLogo; ariaHidden?: boolean }) {
  const inner = brand.logoKey ? (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded brand logo, arbitrary domain
    <img
      src={`/api/media/${brand.logoKey}`}
      alt={ariaHidden ? "" : brand.name}
      className="max-h-16 w-auto max-w-[13rem] object-contain"
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span className="whitespace-nowrap text-center font-[family-name:var(--font-display)] text-2xl font-medium tracking-wide text-[var(--color-ink)] sm:text-3xl">
      {brand.name}
    </span>
  );

  return (
    <li className="flex shrink-0 items-center px-8 lg:px-12">
      <Link
        href={brand.href}
        tabIndex={ariaHidden ? -1 : undefined}
        aria-hidden={ariaHidden}
        className="group flex h-20 items-center justify-center opacity-70 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2"
        aria-label={ariaHidden ? undefined : brand.name}
      >
        {inner}
      </Link>
    </li>
  );
}

// A calm, continuously-scrolling "logo wall" of the clinical-grade partner
// brands (a premium, self-animating credentials band). The track is duplicated
// so the loop is seamless; it pauses on hover, edges are feathered with a mask,
// and it holds still for reduced-motion users (globals.css). Each partner shows
// as a muted mark that lifts to full color on hover. Uploaded logo artwork
// (Admin -> Media) renders in place of the wordmark automatically.
export function BrandLogos({ brands }: BrandLogosProps) {
  if (brands.length === 0) return null;

  return (
    <div className="lunia-marquee">
      <ul className="lunia-marquee-track">
        {brands.map((brand) => (
          <BrandItem key={brand.href} brand={brand} />
        ))}
        {brands.map((brand) => (
          <BrandItem key={`dup-${brand.href}`} brand={brand} ariaHidden />
        ))}
      </ul>
    </div>
  );
}
