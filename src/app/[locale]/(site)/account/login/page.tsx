import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import { buildMetadata } from "@/modules/seo/metadata";
import { getClientSessionUser, CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { LoginForm } from "./LoginForm";

interface AccountLoginPageProps {
  params: Promise<{ locale: string }>;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

export async function generateMetadata({ params }: AccountLoginPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tMetaEn, tMetaAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "account.login.meta" }),
    getTranslations({ locale: "ar", namespace: "account.login.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/account/login",
    titleEn: tMetaEn("title"),
    titleAr: tMetaAr("title"),
    descEn: tMetaEn("description"),
    descAr: tMetaAr("description"),
  });
}

export default async function AccountLoginPage({ params }: AccountLoginPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  // Already signed in? Skip straight to /account rather than showing the
  // login form again.
  const token = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
  if (token && (await getClientSessionUser(token))) {
    redirect(`/${locale}/account`);
  }

  const t = await getTranslations({ locale, namespace: "account.login" });

  const wordmark = "Lunia".split("");

  return (
    <main className="flex flex-col">
      <Section tone="plain">
        <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] shadow-[var(--shadow-lg)] md:grid-cols-2">
          {/* Left: animated Lunia brand stage */}
          <div className="lunia-authpanel relative flex min-h-[220px] items-center justify-center p-10 md:min-h-[560px]">
            <span
              aria-label="Lunia"
              className="lunia-wordmark-anim relative z-10 select-none font-[family-name:var(--font-display)] text-6xl font-medium tracking-[0.18em] text-[var(--color-cream)] sm:text-7xl"
            >
              {wordmark.map((char, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="lunia-wordmark-char"
                  style={{ animationDelay: `${0.15 + i * 0.09}s` }}
                >
                  {char}
                </span>
              ))}
            </span>
          </div>

          {/* Right: sign-in form */}
          <div className="flex flex-col justify-center gap-8 bg-[var(--surface)] p-8 text-start sm:p-12">
            <div className="flex flex-col gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)]">
                {t("heading")}
              </h1>
              <p className="text-sm leading-relaxed text-[var(--color-ink)]/65">{t("intro")}</p>
            </div>
            <LoginForm locale={locale} />
          </div>
        </div>
      </Section>
    </main>
  );
}
