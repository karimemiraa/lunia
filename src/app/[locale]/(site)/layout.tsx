import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { localeDirection } from "@/i18n/routing";
import { fontVariables } from "@/app/fonts";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { StickyBookCta } from "@/components/site/StickyBookCta";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { PageTransition } from "@/components/site/PageTransition";
import { CinematicScroll } from "@/components/site/CinematicScroll";
import { AssistantWidget } from "@/components/site/AssistantWidget";
import { ImpersonationBanner } from "@/components/site/ImpersonationBanner";
import { Tracker } from "@/components/analytics/Tracker";
import { getSetting } from "@/modules/cms/settings";
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
  const [messages, tCommon, business, appearance] = await Promise.all([
    getMessages(),
    getTranslations({ locale, namespace: "common" }),
    getSetting("business").catch(() => null),
    getSetting("appearance").catch(() => null),
  ]);
  const theme = appearance?.theme ?? "luminous";
  return (
    <html lang={locale} dir={localeDirection(locale)} className={fontVariables} data-theme={theme}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider messages={messages}>
          <a href="#main-content" className="lx-skip">
            {tCommon("skipToContent")}
          </a>
          <CinematicScroll />
          <ImpersonationBanner locale={locale} />
          <SiteHeader locale={locale} />
          <PageTransition id="main-content" className="flex-1">
            {children}
          </PageTransition>
          <SiteFooter locale={locale} />
          <StickyBookCta href={`/${locale}/book`} label={tCommon("bookNow")} />
          <WhatsAppFab />
          <AssistantWidget locale={locale} hasWhatsapp={!!business?.whatsapp} />
        </NextIntlClientProvider>
        <Tracker />
      </body>
    </html>
  );
}
