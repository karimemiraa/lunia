import type { ReactNode } from "react";
import Link from "next/link";

interface EmptyStateProps {
  /** A 24px line icon (path children of an <svg>), optional. */
  icon?: ReactNode;
  title: string;
  body?: string;
  /** Primary action: a link or a custom node (e.g. a button opening a form). */
  action?: { href: string; label: string } | ReactNode;
  /** Compact variant for cards/tables. */
  size?: "sm" | "md";
  className?: string;
}

// Consistent empty state: icon, title, one line of help, one primary action.
// Server-safe.
export function EmptyState({ icon, title, body, action, size = "md", className = "" }: EmptyStateProps) {
  const isLink = action && typeof action === "object" && "href" in (action as object);
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${size === "sm" ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14"} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`flex items-center justify-center rounded-full bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)] ${size === "sm" ? "h-10 w-10" : "h-14 w-14"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={size === "sm" ? "h-5 w-5" : "h-6 w-6"}>
          {icon ?? <path d="M4 7h16M4 12h10M4 17h7" />}
        </svg>
      </span>
      <p className={`font-medium text-[var(--color-ink)] ${size === "sm" ? "text-sm" : "font-[family-name:var(--font-display)] text-xl"}`}>{title}</p>
      {body && <p className="max-w-sm text-sm leading-relaxed text-[var(--color-ink)]/60">{body}</p>}
      {action &&
        (isLink ? (
          <Link href={(action as { href: string }).href} className="lunia-btn lunia-btn-forest lunia-btn-sm mt-1">
            {(action as { label: string }).label}
          </Link>
        ) : (
          <div className="mt-1">{action as ReactNode}</div>
        ))}
    </div>
  );
}
