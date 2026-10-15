import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import "./_ui/staffDark.css";
import { fontVariables } from "@/app/fonts";
import { getStaffDisplay } from "./_i18n/display";
import { SYSTEM_THEME_SCRIPT, ThemeSync } from "./_components/ThemeSync";
import { AskLunia } from "./_components/AskLunia";
import { StaffI18nProvider } from "./_i18n/StaffI18n";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/modules/iam/rbac";
import { getAssistantApiKey } from "@/modules/staffAssistant/assistant";

// Staff can "Add to Home Screen" on the front-desk iPad: its own manifest so
// the installed app opens straight into /admin, full screen.
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Lunia Staff", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#2b4d47" };

// Auth-gated, per-request; never statically prerendered.
export const dynamic = "force-dynamic";

// The admin document follows the staff member's language (Display menu):
// English/LTR by default, Arabic/RTL when chosen, so portaled dialogs and
// toasts mirror too. Strings are translated with t() (see _i18n/t.ts).
// The theme (light / dark / match device) is a cookie, so data-theme is right on
// the first byte. Fonts: Inter (Latin) + IBM Plex Sans Arabic, self-hosted.
//
// The Ask Lunia team assistant lives here (not in each page's AdminShell) so it
// stays mounted across navigations: the chat and an in-flight answer survive
// "take me to…" jumps and route loading skeletons.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [{ theme, locale }, staff] = await Promise.all([getStaffDisplay(), cookies().then((c) => getCurrentUser(c.get("lunia_session")?.value))]);
  const aiEnabled = staff ? Boolean(await getAssistantApiKey().catch(() => null)) : false;
  // Per-request CSP nonce (see src/middleware.ts) so the theme script may run.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={fontVariables}
      data-theme={theme === "dark" ? "midnight" : undefined}
      // "Match device" sets data-theme before hydration (script below).
      suppressHydrationWarning
    >
      <head>{theme === "system" && <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />}</head>
      <body className="lunia-staff bg-[var(--surface-2)] text-[var(--color-ink)]">
        <StaffI18nProvider locale={locale}>
          {children}
          {staff && <AskLunia locale={locale} aiEnabled={aiEnabled} />}
          <ThemeSync theme={theme} />
        </StaffI18nProvider>
      </body>
    </html>
  );
}
