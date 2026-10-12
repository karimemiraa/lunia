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
import { DisplayMenu } from "./DisplayMenu";
import { getStaffDisplay } from "../_i18n/display";
import { st } from "../_i18n/staffLocale";

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
  const [feed, navSetting, display] = await Promise.all([
    presetFeed ?? getNotificationFeed(user.permissions),
    getSetting("adminNav").catch(() => null),
    getStaffDisplay(),
  ]);
  const { locale } = display;
  const hiddenHrefs = navSetting?.hiddenHrefs ?? [];
  const visible = visibleNavItems(user.permissions, hiddenHrefs);
  const allowedHrefs = new Set(visible.map((i) => i.href));
  // Labels follow the staff language; the English label stays searchable as a keyword.
  const pages = visible.map((i) => ({
    href: i.href,
    label: st(i.label, locale),
    group: st(i.group, locale),
    icon: i.icon,
    keywords: locale === "en" ? i.keywords : `${i.keywords ?? ""} ${i.label} ${i.group}`.trim(),
  }));
  const paletteActions = paletteActionsFor(user.permissions, allowedHrefs).map((a) =>
    locale === "en" ? a : { ...a, label: st(a.label, locale), hint: a.hint && st(a.hint, locale), keywords: `${a.keywords ?? ""} ${a.label}`.trim() },
  );
  const permissionList = [...user.permissions];

  return (
    // Arabic mirrors the shell (dir="rtl" puts the sidebar on the right and flips
    // the chrome); page content below stays English/LTR until it is translated.
    <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="flex min-h-screen text-[var(--color-ink)]">
      <AdminNav permissions={user.permissions} hiddenHrefs={hiddenHrefs} locale={locale} />
      <div className="lunia-admin-bg relative min-w-0 flex-1 pt-14 md:pt-0">
        <main className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {/* Top bar: command palette + notification center + display (language/theme). */}
          <div className="mb-6 flex items-center gap-3">
            <CommandPalette pages={pages} actions={paletteActions} locale={locale} />
            <NotificationBell feed={feed} locale={locale} />
            <DisplayMenu locale={locale} theme={display.theme} />
          </div>
          <Breadcrumbs leafTitle={title} permissions={permissionList} hiddenHrefs={hiddenHrefs} locale={locale} />
          <div dir="ltr" lang="en">
            <PageHeader title={title} description={description} actions={actions} />
            <div className="lunia-animate-fade-up">{children}</div>
            <Toaster />
          </div>
        </main>
      </div>
      <KeyboardShortcuts allowedHrefs={[...allowedHrefs]} canBook={user.permissions.has(PERMISSIONS.BOOKING_MANAGE) && allowedHrefs.has("/admin/calendar")} locale={locale} />
      <DocumentTitle title={title} badge={feed.total} />
    </div>
  );
}
