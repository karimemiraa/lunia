import type { ReactNode } from "react";
import Link from "next/link";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Primary action: a link or a custom node (button). */
  action?: { label: string; href: string } | ReactNode;
  icon?: ReactNode;
  className?: string;
  /** Compact variant for inside cards. */
  compact?: boolean;
}

/** Helpful empty state with one primary action. Server-safe. */
export function EmptyState({ title, description, action, icon, className = "", compact = false }: EmptyStateProps) {
  const isLink = action && typeof action === "object" && "href" in (action as object);
  return (
    <div className={`flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] text-center ${compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12"} ${className}`}>
      <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--color-teal-ink)]">
        {icon ?? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5 12 4l8 3.5M4 7.5v9l8 3.5m-8-12.5 8 3.5m0 0 8-3.5m-8 3.5V20m8-12.5v9l-8 3.5" />
          </svg>
        )}
      </span>
      <p className="text-base font-medium text-[var(--color-ink)]">{title}</p>
      {description && <p className="max-w-md text-sm leading-relaxed text-[var(--color-ink)]/60">{description}</p>}
      {action &&
        (isLink ? (
          <Link href={(action as { href: string }).href} className="lunia-btn lunia-btn-forest mt-1 min-h-11">
            {(action as { label: string }).label}
          </Link>
        ) : (
          <div className="mt-1">{action as ReactNode}</div>
        ))}
    </div>
  );
}
