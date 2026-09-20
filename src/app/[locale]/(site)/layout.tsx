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
import { CustomCursor } from "@/components/site/CustomCursor";
import { AssistantWidget } from "@/components/site/AssistantWidget";
import { Tracker } from "@/components/analytics/Tracker";
import { prisma } from "@/lib/db";
import { getSetting } from "@/modules/cms/settings";
import { localized } from "@/modules/catalog/localize";
import "@/app/globals.css";

function waHref(raw: string | undefined): string | null {
  if (!raw) return null;
  return `https://wa.me/${raw.replace(/[^\d+]/g, "").replace(/^\+/, "")}`;
}

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
  const [messages, tCommon, services, business] = await Promise.all([
    getMessages(),
    getTranslations({ locale, namespace: "common" }),
    prisma.service.findMany({ where: { isPublished: true }, select: { slug: true, nameEn: true, nameAr: true }, orderBy: { order: "asc" } }),
    getSetting("business").catch(() => null),
  ]);
  const assistantServices = services.map((s) => ({ slug: s.slug, name: localized(locale as "en" | "ar", s.nameEn, s.nameAr) }));
  return (
    <html lang={locale} dir={localeDirection(locale)} className={fontVariables}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider messages={messages}>
          <CinematicScroll />
          <CustomCursor />
          <SiteHeader locale={locale} />
          <PageTransition className="flex-1">{children}</PageTransition>
          <SiteFooter locale={locale} />
          <StickyBookCta href={`/${locale}/book`} label={tCommon("bookNow")} />
          <WhatsAppFab />
          <AssistantWidget
            locale={locale}
            services={assistantServices}
            whatsappHref={waHref(business?.whatsapp)}
            bookHref={`/${locale}/book`}
          />
        </NextIntlClientProvider>
        <Tracker />
      </body>
    </html>
  );
}
