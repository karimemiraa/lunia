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
      <main className="min-w-0 flex-1 p-8">
        <PageHeader title={title} description={description} actions={actions} />
        {children}
      </main>
    </div>
  );
}
