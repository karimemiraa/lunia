import Link from "next/link";
import { MediaFrame } from "./MediaFrame";

interface BrandCardMedia {
  key: string;
  kind?: "IMAGE" | "VIDEO";
}

interface BrandCardProps {
  name: string;
  blurb?: string;
  href: string;
  logo?: BrandCardMedia | null;
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

// A quiet, logo-led teaser for a partner brand — deliberately lower-key than
// ServiceCard (no image-forward layout) since brands are a credential, not
// the primary offer. No borders or shadow; the only hover cue is the name
// warming to teal.
export function BrandCard({ name, blurb, href, logo }: BrandCardProps) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-5 rounded-sm p-2 text-start transition-colors duration-300 ${focusRingClass}`}
    >
      <MediaFrame
        mediaKey={logo?.key}
        kind={logo?.kind}
        alt={name}
        aspectClassName="aspect-square"
        className="h-16 w-16 shrink-0"
      />
      <div className="flex flex-col gap-1.5 pt-1">
        <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)] transition-colors duration-300 group-hover:text-[var(--color-canopy)]">
          {name}
        </h3>
        {blurb && <p className="text-sm leading-relaxed text-[var(--color-ink)]/65">{blurb}</p>}
      </div>
    </Link>
  );
}
