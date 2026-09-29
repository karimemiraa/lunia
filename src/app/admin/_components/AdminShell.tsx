import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";
import { PageHeader } from "./PageHeader";
import { NotificationBell } from "./NotificationBell";
import { CommandPalette } from "./CommandPalette";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { Breadcrumbs } from "./Breadcrumbs";
import { Toaster } from "./Toaster";
import { DocumentTitle } from "./DocumentTitle";
import { visibleNavItems, paletteActionsFor } from "./navCatalog";
import type { AdminUser } from "./requireAdmin";
import { getNotificationFeed, type NotificationFeed } from "@/modules/notifications/feed";
import { getSetting } from "@/modules/cms/settings";
import { PERMISSIONS } from "@/modules/iam/permissions";

interface AdminShellProps {
  user: AdminUser;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** A page that already loaded the feed (the dashboard) can pass it in. */
  feed?: NotificationFeed;
}

export async function AdminShell({ user, title, description, actions, children, feed: presetFeed }: AdminShellProps) {
  const [feed, navSetting] = await Promise.all([
    presetFeed ?? getNotificationFeed(user.permissions),
    getSetting("adminNav").catch(() => null),
  ]);
  const hiddenHrefs = navSetting?.hiddenHrefs ?? [];
  const visible = visibleNavItems(user.permissions, hiddenHrefs);
  const allowedHrefs = new Set(visible.map((i) => i.href));
  const pages = visible.map((i) => ({ href: i.href, label: i.label, group: i.group, icon: i.icon, keywords: i.keywords }));
  const paletteActions = paletteActionsFor(user.permissions, allowedHrefs);
  const permissionList = [...user.permissions];

  return (
    <div className="flex min-h-screen text-[var(--color-ink)]">
      <AdminNav permissions={user.permissions} hiddenHrefs={hiddenHrefs} />
      <div className="lunia-admin-bg relative min-w-0 flex-1 pt-14 md:pt-0">
        <main className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {/* Top bar: command palette + notification center. */}
          <div className="mb-6 flex items-center gap-3">
            <CommandPalette pages={pages} actions={paletteActions} />
            <NotificationBell feed={feed} />
          </div>
          <Breadcrumbs leafTitle={title} permissions={permissionList} hiddenHrefs={hiddenHrefs} />
          <PageHeader title={title} description={description} actions={actions} />
          <div className="lunia-animate-fade-up">{children}</div>
        </main>
      </div>
      <KeyboardShortcuts allowedHrefs={[...allowedHrefs]} canBook={user.permissions.has(PERMISSIONS.BOOKING_MANAGE) && allowedHrefs.has("/admin/calendar")} />
      <Toaster />
      <DocumentTitle title={title} badge={feed.total} />
    </div>
  );
}
