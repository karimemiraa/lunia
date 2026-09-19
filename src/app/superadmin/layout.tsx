import "@/app/globals.css";
import { fontVariables } from "@/app/fonts";

// Auth-gated, per-request; never statically prerendered.
export const dynamic = "force-dynamic";

// Superadmin is a separate area from /admin, English-default / LTR, sharing
// the same brand font variables. Access is gated per-page on PLATFORM_MANAGE.
export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={fontVariables}>
      <body className="bg-[var(--color-page)] text-[var(--color-ink)]">{children}</body>
    </html>
  );
}
