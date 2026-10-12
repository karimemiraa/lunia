import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import "./_ui/staffDark.css";
import { fontVariables } from "@/app/fonts";
import { getStaffDisplay } from "./_i18n/display";
import { SYSTEM_THEME_SCRIPT, ThemeSync } from "./_components/ThemeSync";

// Staff can "Add to Home Screen" on the front-desk iPad: its own manifest so
// the installed app opens straight into /admin, full screen.
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Lunia Staff", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#2b4d47" };

// Auth-gated, per-request; never statically prerendered.
export const dynamic = "force-dynamic";

// The admin document stays English / LTR: page content (and every portaled
// dialog/toast) is English. Staff who pick Arabic in the Display menu get a
// mirrored RTL *shell* (sidebar, top bar, breadcrumbs, menus) — see AdminShell.
// The theme (light / dark / match device) is a cookie, so data-theme is right on
// the first byte. Fonts: the brand variables (The Seasons/Cormorant + Inter).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { theme } = await getStaffDisplay();
  return (
    <html
      lang="en"
      dir="ltr"
      className={fontVariables}
      data-theme={theme === "dark" ? "midnight" : undefined}
      // "Match device" sets data-theme before hydration (script below).
      suppressHydrationWarning
    >
      <head>{theme === "system" && <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />}</head>
      <body className="lunia-staff bg-[var(--surface-2)] text-[var(--color-ink)]">
        {children}
        <ThemeSync theme={theme} />
      </body>
    </html>
  );
}
