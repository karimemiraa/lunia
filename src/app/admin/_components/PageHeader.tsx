import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--color-ink)]/10 pb-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--color-ink)]/70">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
