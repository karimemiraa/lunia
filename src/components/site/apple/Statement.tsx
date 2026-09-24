interface StatementProps {
  eyebrow?: string;
  text: string;
  /** Small supporting line under the statement. */
  note?: string;
  id?: string;
  tone?: "light" | "dark";
}

// A single large statement whose words brighten as you read them (the same
// scroll-highlight as the homepage manifesto, CinematicScroll's
// [data-highlight]) — on a light ground by default. Without JS every word is
// simply shown at full strength.
export function Statement({ eyebrow, text, note, id, tone = "light" }: StatementProps) {
  const dark = tone === "dark";
  return (
    <section
      id={id}
      className={`scroll-mt-32 py-[clamp(6rem,16svh,11rem)] ${dark ? "bg-[var(--color-forest)] text-[var(--color-cream)]" : "bg-[var(--color-page)]"}`}
    >
      <div className="mx-auto w-full max-w-5xl px-6">
        {eyebrow && (
          <span className={`lx-eyebrow ${dark ? "text-[var(--color-teal)]" : ""}`}>
            <span aria-hidden="true" className="lunia-glow-mark" />
            {eyebrow}
          </span>
        )}
        <p
          data-highlight
          className={`lx-highlight lx-display mt-7 text-[clamp(1.9rem,1rem+3vw,4rem)] leading-[1.15] ${dark ? "" : "lx-highlight-light text-[var(--color-ink)]"}`}
        >
          {text}
        </p>
        {note && <p className={`mt-8 max-w-2xl text-[0.98rem] leading-relaxed ${dark ? "text-[var(--color-cream)]/65" : "text-[var(--color-ink)]/60"}`}>{note}</p>}
      </div>
    </section>
  );
}
