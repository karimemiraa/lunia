import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { localeDirection } from "@/i18n/routing";
import { fontVariables } from "@/app/fonts";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SereneHeader } from "@/components/site/serene/SereneHeader";
import { SereneFooter } from "@/components/site/serene/SereneFooter";
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
  // The "edition" chooses the site chrome: classic keeps the original sticky
  // header; every other edition uses the Serene floating glass nav sitewide
  // (so the homepage and inner pages match). The floating header overlays
  // content, so inner pages get a top spacer (the homepage bodies are
  // full-bleed and sit under it by design — they live in the (home) group).
  const serene = (appearance?.edition ?? "cinematic") !== "classic";

  return (
    <html lang={locale} dir={localeDirection(locale)} className={fontVariables} data-theme={theme} data-chrome={serene ? "serene" : "classic"}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider messages={messages}>
          <a href="#main-content" className="lx-skip">
            {tCommon("skipToContent")}
          </a>
          <CinematicScroll />
          <ImpersonationBanner locale={locale} />
          {serene ? <SereneHeader locale={locale} /> : <SiteHeader locale={locale} />}
          {serene ? (
            <main id="main-content" className="flex-1 pt-[var(--serene-head-h)]">
              {children}
            </main>
          ) : (
            <PageTransition id="main-content" className="flex-1">
              {children}
            </PageTransition>
          )}
          {serene ? <SereneFooter locale={locale} /> : <SiteFooter locale={locale} />}
          {!serene && <StickyBookCta href={`/${locale}/book`} label={tCommon("bookNow")} />}
          {!serene && <WhatsAppFab />}
          <AssistantWidget locale={locale} hasWhatsapp={!!business?.whatsapp} />
        </NextIntlClientProvider>
        <Tracker />
      </body>
    </html>
  );
}
