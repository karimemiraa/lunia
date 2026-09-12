import "@/app/globals.css";
import { fontVariables } from "@/app/fonts";

// Auth-gated, per-request; never statically prerendered.
export const dynamic = "force-dynamic";

// The admin suite is English-default / LTR. It applies the same brand font
// variables as the public site so headings render in The Seasons (Cormorant)
// and body copy in Inter, rather than the browser default.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={fontVariables}>
      <body className="bg-[var(--surface-2)] text-[var(--color-ink)]">{children}</body>
    </html>
  );
}
