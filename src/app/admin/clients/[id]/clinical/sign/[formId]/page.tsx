import Link from "next/link";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { requireAdmin } from "../../../../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getConsentForm } from "@/modules/clinical/consents";
import { ConsentSignForm } from "@/components/clinical/ConsentSignForm";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { signAtDeskAction } from "../../actions";
import { loadClient } from "../../_components/loadClient";

interface Props {
  params: Promise<{ id: string; formId: string }>;
  searchParams: Promise<{ lang?: string }>;
}

// Full-screen desk signing for an iPad handed to the customer: no admin
// navigation, big text, a large signature area, and a language switch so the
// customer reads the form in Arabic or English. Staff are recorded as witness.
export default async function DeskSignPage({ params, searchParams }: Props) {
  const [{ id, formId }, { lang: rawLang }] = await Promise.all([params, searchParams]);
  await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const client = await loadClient(id);
  const form = await getConsentForm(formId);
  if (!form || !form.isActive) notFound();

  const lang = rawLang === "en" ? "en" : "ar";
  const m = lang === "ar" ? ar : en;
  // The success screen's "back" goes to the staff view here, not "my account".
  const messages = { consents: { ...m.consents, sign: { ...m.consents.sign, back: lang === "ar" ? "تم" : "Done" } } };
  const title = lang === "ar" ? form.titleAr : form.titleEn;
  const body = lang === "ar" ? form.bodyAr : form.bodyEn;
  const self = `/admin/clients/${id}/clinical/sign/${formId}`;

  return (
    <div className="min-h-screen bg-[var(--color-page,#faf8f4)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-white px-4 py-3 sm:px-8">
        <Link href={`/admin/clients/${id}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
          Close
        </Link>
        <div className="flex gap-1 rounded-full bg-[var(--surface-2)] p-1" role="group" aria-label="Language">
          {(["ar", "en"] as const).map((l) => (
            <Link
              key={l}
              href={`${self}?lang=${l}`}
              aria-current={l === lang ? "true" : undefined}
              className={`inline-flex min-h-10 min-w-16 items-center justify-center rounded-full px-4 text-sm font-medium ${l === lang ? "bg-white shadow-sm" : "text-[var(--color-ink)]/60"}`}
            >
              {l === "ar" ? "العربية" : "English"}
            </Link>
          ))}
        </div>
      </div>
      <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-[var(--color-ink)]/55">{client.displayName}</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)] sm:text-4xl">{title}</h1>
          <p className="text-sm text-[var(--color-ink)]/50">v{form.version}</p>
        </div>
        <div className="flex max-h-[45vh] flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 text-lg leading-relaxed text-[var(--color-ink)] shadow-sm" tabIndex={0}>
          {body.split("\n\n").map((para, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <NextIntlClientProvider locale={lang} timeZone="Asia/Riyadh" messages={messages}>
            <ConsentSignForm
              key={lang}
              defaultName={client.fullName}
              submit={signAtDeskAction.bind(null, id, formId, lang)}
              signedHrefPrefix={`/admin/clients/${id}/clinical/consent/`}
              backHref={`/admin/clients/${id}`}
              padHeight={340}
              large
            />
          </NextIntlClientProvider>
        </div>
      </main>
    </div>
  );
}
