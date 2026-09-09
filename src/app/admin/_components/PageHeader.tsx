import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <span className="inline-flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-[var(--color-teal-ink)]">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3 fill-current">
            <path d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z" />
          </svg>
          Lunia Admin
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-medium leading-tight text-[var(--color-ink)] sm:text-4xl">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--color-ink)]/60">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
