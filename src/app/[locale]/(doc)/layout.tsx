import { localeDirection } from "@/i18n/routing";
import { fontVariables } from "@/app/fonts";
import "@/app/globals.css";

// Bare document shell for printable customer documents (invoices): no site
// header/footer/widgets so the page prints exactly like the paper invoice.
export const dynamic = "force-dynamic";

export default async function DocLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <html lang={locale} dir={localeDirection(locale)} className={fontVariables}>
      <body className="min-h-screen bg-[var(--surface-2)] text-[var(--color-ink)]">{children}</body>
    </html>
  );
}
