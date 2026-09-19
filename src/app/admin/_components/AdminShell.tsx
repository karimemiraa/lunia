import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";
import { PageHeader } from "./PageHeader";
import { NotificationBell } from "./NotificationBell";
import type { AdminUser } from "./requireAdmin";
import { getNotificationFeed } from "@/modules/notifications/feed";

interface AdminShellProps {
  user: AdminUser;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export async function AdminShell({ user, title, description, actions, children }: AdminShellProps) {
  const feed = await getNotificationFeed();
  return (
    <div className="flex min-h-screen text-[var(--color-ink)]">
      <AdminNav permissions={user.permissions} />
      <div className="lunia-admin-bg relative min-w-0 flex-1">
        <main className="relative mx-auto w-full max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          {/* Global search + notification center. */}
          <div className="mb-6 flex items-center gap-3">
            <form method="get" action="/admin/search" className="flex flex-1 items-center gap-2 sm:max-w-md" role="search">
              <div className="relative flex-1">
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
            <NotificationBell feed={feed} />
          </div>
          <PageHeader title={title} description={description} actions={actions} />
          <div className="lunia-animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
