import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { localeDirection } from "@/i18n/routing";
import { fontVariables } from "@/app/fonts";
import { SereneHeader } from "@/components/site/serene/SereneHeader";
import { SereneFooter } from "@/components/site/serene/SereneFooter";
import { CinematicScroll } from "@/components/site/CinematicScroll";
import { AssistantWidget } from "@/components/site/AssistantWidget";
import { Tracker } from "@/components/analytics/Tracker";
import { getSetting } from "@/modules/cms/settings";
import "@/app/globals.css";

export const dynamic = "force-dynamic";

// The Serene Edition's own chrome — a bespoke animated header + light footer,
// the GSAP scroll engine (data-reveal / data-splittext / data-count hooks) and
// the intl provider. Separate from the main site layout so /v2 is a fully
// distinct experience. Inherits the active theme.
export default async function SereneLayout({
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
      <body className="flex min-h-screen flex-col bg-[var(--color-page)]">
        <NextIntlClientProvider messages={messages}>
          <a href="#main-content" className="lx-skip">{tCommon("skipToContent")}</a>
          <CinematicScroll />
          <SereneHeader locale={locale} />
          <main id="main-content" className="flex-1">{children}</main>
          <SereneFooter locale={locale} />
          <AssistantWidget locale={locale} hasWhatsapp={!!business?.whatsapp} />
        </NextIntlClientProvider>
        <Tracker />
      </body>
    </html>
  );
}
