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
