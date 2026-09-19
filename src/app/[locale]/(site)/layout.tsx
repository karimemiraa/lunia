import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { localeDirection } from "@/i18n/routing";
import { fontVariables } from "@/app/fonts";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { StickyBookCta } from "@/components/site/StickyBookCta";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { Tracker } from "@/components/analytics/Tracker";
import "@/app/globals.css";

// DB-backed CMS content renders per request (fresh content, no build-time DB
// dependency, and no static-export step).
export const dynamic = "force-dynamic";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [messages, tCommon] = await Promise.all([getMessages(), getTranslations({ locale, namespace: "common" })]);
  return (
    <html lang={locale} dir={localeDirection(locale)} className={fontVariables}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider messages={messages}>
          <SiteHeader locale={locale} />
          <div className="flex-1">{children}</div>
          <SiteFooter locale={locale} />
          <StickyBookCta href={`/${locale}/book`} label={tCommon("bookNow")} />
          <WhatsAppFab />
        </NextIntlClientProvider>
        <Tracker />
      </body>
    </html>
  );
}
