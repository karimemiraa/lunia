// Shimmer skeletons for route-level loading.tsx files. Server-safe. Every
// block reserves the space of the content it stands in for, so the swap to
// real content doesn't shift the layout.

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div aria-hidden="true" className={`lunia-skeleton ${className}`} />;
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="lunia-skeleton h-3" style={{ width: `${i === lines - 1 ? 55 : 90 - i * 8}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`lunia-card p-5 ${className}`}>
      <div className="lunia-skeleton mb-4 h-4 w-1/3" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="lunia-skeleton h-8 w-8 shrink-0 rounded-full" />
            <div className="lunia-skeleton h-3 flex-1" />
            <div className="lunia-skeleton h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="lunia-card flex flex-col gap-3 p-5">
          <div className="lunia-skeleton h-3 w-1/2" />
          <div className="lunia-skeleton h-9 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden="true" className="lunia-card overflow-hidden">
      <div className="flex gap-4 border-b border-[var(--line)] px-5 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className="lunia-skeleton h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="lunia-skeleton h-3.5 flex-1" style={{ opacity: 1 - r * 0.08 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Whole-page skeleton in the shape of AdminShell (sidebar + top bar + header),
 * so a route's loading.tsx can drop it in and only vary the body.
 */
export function ShellSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" role="status" aria-live="polite" aria-label="Loading">
      <div aria-hidden="true" className="hidden h-screen w-60 shrink-0 flex-col gap-2 lunia-teal-field border-e border-[var(--color-ink)]/10 px-3 py-4 md:flex">
        <div className="mb-3 h-8 w-24 rounded-full bg-white/45" />
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="mt-1 h-7 rounded-[var(--radius-sm)] bg-white/30" style={{ width: `${70 + ((i * 13) % 25)}%` }} />
        ))}
      </div>
      <div className="lunia-admin-bg relative min-w-0 flex-1 pt-14 md:pt-0">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <div className="mb-6 flex items-center gap-3">
            <div className="lunia-skeleton h-10 flex-1 sm:max-w-md" />
            <div className="lunia-skeleton h-10 w-10 rounded-full" />
          </div>
          <div className="mb-8 border-b border-[var(--line)] pb-6">
            <div className="lunia-skeleton mb-3 h-3 w-24" />
            <div className="lunia-skeleton h-9 w-64" />
          </div>
          <div className="flex flex-col gap-6">{children}</div>
          <span className="sr-only">Loading…</span>
        </div>
      </div>
    </div>
  );
}
