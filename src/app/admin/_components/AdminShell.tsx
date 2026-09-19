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
      <div className="lunia-admin-bg relative min-w-0 flex-1">
        <main className="relative mx-auto w-full max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          {/* Global search across customers, inquiries, and WhatsApp. */}
          <form method="get" action="/admin/search" className="mb-6 flex items-center gap-2" role="search">
            <div className="relative flex-1 sm:max-w-md">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-[var(--color-ink)]/40" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                name="q"
                placeholder="Search customers, inquiries, WhatsApp…"
                aria-label="Search the system"
                className="lunia-input w-full ps-9"
              />
            </div>
          </form>
          <PageHeader title={title} description={description} actions={actions} />
          <div className="lunia-animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
