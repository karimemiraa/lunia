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
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-[var(--color-teal-ink)]">
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
