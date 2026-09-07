import { PropsWithChildren } from "react";

interface ProseProps extends PropsWithChildren {
  className?: string;
}

// A readable rich-text column for CMS/catalog long-form copy (About story,
// Journal posts). Deliberately narrow with generous line-height for
// editorial reading comfort in both scripts; logical-property spacing so
// nested marks (headings, lists, blockquotes) mirror correctly under RTL.
export function Prose({ children, className = "" }: ProseProps) {
  return (
    <div
      className={`mx-auto max-w-2xl text-start text-base leading-loose text-[var(--color-ink)]/85 sm:text-lg
        [&_h2]:font-[family-name:var(--font-display)] [&_h2]:mt-10 [&_h2]:text-3xl [&_h2]:text-[var(--color-ink)]
        [&_h3]:font-[family-name:var(--font-display)] [&_h3]:mt-8 [&_h3]:text-2xl [&_h3]:text-[var(--color-ink)]
        [&_p]:mt-5 [&_p:first-child]:mt-0
        [&_a]:text-[var(--color-ink)] [&_a]:underline [&_a]:decoration-[var(--color-teal)] [&_a]:underline-offset-4
        [&_ul]:mt-5 [&_ul]:ps-6 [&_ul]:list-disc [&_ol]:mt-5 [&_ol]:ps-6 [&_ol]:list-decimal
        [&_blockquote]:mt-8 [&_blockquote]:border-s-2 [&_blockquote]:border-[var(--color-gold)] [&_blockquote]:ps-6
        [&_blockquote]:font-[family-name:var(--font-display)] [&_blockquote]:text-xl [&_blockquote]:italic [&_blockquote]:text-[var(--color-ink)]/80
        ${className}`.replace(/\s+/g, " ").trim()}
    >
      {children}
    </div>
  );
}
