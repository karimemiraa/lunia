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

// A quiet "logo wall" of the clinical-grade partner brands. Until real logo
// artwork is uploaded (Admin -> Media, then set on the brand), each partner is
// shown as a clean monochrome wordmark; once a logo image exists it renders in
// its place automatically. Monochrome + muted so the row reads as one calm
// band of credentials rather than competing marks.
export function BrandLogos({ brands }: BrandLogosProps) {
  return (
    <ul className="grid grid-cols-2 items-center gap-x-10 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {brands.map((brand) => (
        <li key={brand.href} className="lunia-scroll-fade flex items-center justify-center">
          <Link
            href={brand.href}
            className="group flex h-24 w-full items-center justify-center opacity-85 transition-opacity duration-300 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2"
            aria-label={brand.name}
          >
            {brand.logoKey ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded brand logo, arbitrary domain
              <img
                src={`/api/media/${brand.logoKey}`}
                alt={brand.name}
                className="max-h-20 w-auto max-w-[15rem] object-contain sm:max-h-24"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="text-center font-[family-name:var(--font-display)] text-2xl font-medium tracking-wide text-[var(--color-ink)] sm:text-3xl">
                {brand.name}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
