import Link from "next/link";
import { MediaFrame } from "./MediaFrame";

interface ServiceCardMedia {
  key: string;
  kind?: "IMAGE" | "VIDEO";
}

interface ServiceCardProps {
  name: string;
  summary?: string;
  href: string;
  media?: ServiceCardMedia | null;
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

// A single service teaser: an image with generous breathing room below it,
// no card chrome (border/shadow/background) so it reads as an editorial
// entry rather than a boxed template tile. The whole card lifts gently on
// hover and the title's underline draws in — restrained, not a shadow pop.
export function ServiceCard({ name, summary, href, media }: ServiceCardProps) {
  return (
    <Link
      href={href}
      className={`lunia-scroll-fade group flex flex-col gap-5 rounded-sm text-start transition-transform duration-300 ease-out hover:-translate-y-1 ${focusRingClass}`}
    >
      <MediaFrame mediaKey={media?.key} kind={media?.kind} alt={name} aspectClassName="aspect-[4/5]" />
      <div className="flex flex-col gap-2">
        <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)] underline decoration-transparent decoration-2 underline-offset-4 transition-colors duration-300 group-hover:decoration-[var(--color-gold)]">
          {name}
        </h3>
        {summary && <p className="text-sm leading-relaxed text-[var(--color-ink)]/70">{summary}</p>}
      </div>
    </Link>
  );
}
