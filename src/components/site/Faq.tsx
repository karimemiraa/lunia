interface FaqItem {
  q: string;
  a: string;
}

interface FaqProps {
  items: FaqItem[];
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

// An accessible accordion built on native <details>/<summary> rather than a
// JS-driven disclosure: keyboard and screen-reader support come for free,
// no client component needed, and each item's open state is the one native
// signal (no separate aria-expanded bookkeeping to keep in sync). The same
// `items` array is what src/modules/seo/jsonld.ts's `faqPage()` helper
// (Task 5) will read to emit matching FAQPage JSON-LD.
export function Faq({ items }: FaqProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col divide-y divide-[var(--color-ink)]/10">
      {items.map((item, index) => (
        <details key={index} className="group py-7 sm:py-8">
          <summary
            className={`flex cursor-pointer list-none items-center justify-between gap-6 text-start [&::-webkit-details-marker]:hidden ${focusRingClass}`}
          >
            <span className="font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--color-ink)] sm:text-[1.75rem]">
              {item.q}
            </span>
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-ink)]/15 text-xl font-light leading-none text-[var(--color-ink)]/60 transition-all duration-300 group-open:rotate-45 group-open:bg-[var(--color-teal)] group-open:text-[var(--color-ink)]"
            >
              +
            </span>
          </summary>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--color-ink)]/70 sm:text-[1.075rem]">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
