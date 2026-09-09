import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";
import { PageHeader } from "./PageHeader";
import type { AdminUser } from "./requireAdmin";

interface AdminShellProps {
  user: AdminUser;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminShell({ user, title, description, actions, children }: AdminShellProps) {
  return (
    <div className="flex min-h-screen text-[var(--color-ink)]">
      <AdminNav permissions={user.permissions} />
      <div className="lunia-mosaic relative min-w-0 flex-1 bg-[var(--surface-2)]">
        {/* soft brand wash at the top of the content area */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(80%_100%_at_0%_0%,color-mix(in_srgb,var(--color-teal)_18%,transparent),transparent_70%)]"
        />
        <main className="relative mx-auto w-full max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          <PageHeader title={title} description={description} actions={actions} />
          <div className="lunia-animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
