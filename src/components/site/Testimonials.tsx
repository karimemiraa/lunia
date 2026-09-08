import { SectionHeading } from "./SectionHeading";

interface TestimonialItem {
  quote: string;
  author?: string;
}

interface TestimonialsProps {
  eyebrow?: string;
  heading?: string;
  items: TestimonialItem[];
}

// The brand's quiet moon/star "glow" mark, used here as the pull-quote mark.
function GlowMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path
        fill="currentColor"
        d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z"
      />
    </svg>
  );
}

// Quiet, editorial social proof: large serif pull-quotes with no card
// chrome, quotation glyphs, or star ratings — restrained rather than the
// usual boxed-testimonial-carousel look. Quotation marks are intentionally
// omitted since their glyph direction differs by script; the italic serif
// treatment alone signals "quote".
export function Testimonials({ eyebrow, heading, items }: TestimonialsProps) {
  return (
    <div className="flex flex-col gap-16">
      {heading && <SectionHeading eyebrow={eyebrow} heading={heading} align="center" className="mx-auto" />}

      <div className="grid gap-16 sm:grid-cols-2">
        {items.map((item, index) => (
          <figure key={index} className="flex flex-col gap-6 text-start">
            <GlowMark className="h-4 w-4 shrink-0 text-[var(--color-gold)]" />
            <blockquote className="font-[family-name:var(--font-display)] text-2xl italic leading-snug text-[var(--color-ink)] sm:text-3xl">
              {item.quote}
            </blockquote>
            {item.author && (
              <figcaption className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-ink)]/50">
                {item.author}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
