import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { localeDirection } from "@/i18n/routing";
import { fontVariables } from "@/app/fonts";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import "@/app/globals.css";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <html lang={locale} dir={localeDirection(locale)} className={fontVariables}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider messages={messages}>
          <SiteHeader locale={locale} />
          <div className="flex-1">{children}</div>
          <SiteFooter locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
