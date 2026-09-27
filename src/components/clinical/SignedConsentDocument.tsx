// Printable rendering of one signed consent: the exact text snapshot the
// client agreed to, who signed, when, which version, and the signature image.
// Used by the customer's account and the admin patient file. Plain markup +
// print: utilities so "Print" produces a clean single document.

interface SignedConsentDocumentProps {
  snapshot: string;
  locale: string;
  signerName: string;
  signedAtLabel: string;
  version: number;
  signatureData: string;
  labels: { signedBy: string; signedAt: string; version: string };
  /** Extra admin-only facts (IP, witness, booking), shown under the signature. */
  footer?: React.ReactNode;
}

export function SignedConsentDocument({ snapshot, locale, signerName, signedAtLabel, version, signatureData, labels, footer }: SignedConsentDocumentProps) {
  const [title, ...rest] = snapshot.split("\n\n");
  const dir = locale === "ar" ? "rtl" : "ltr";
  return (
    <article dir={dir} lang={locale} className="mx-auto flex max-w-3xl flex-col gap-6 rounded-2xl bg-white p-8 text-[var(--color-ink)] shadow-sm print:max-w-none print:rounded-none print:p-0 print:shadow-none">
      <header className="flex flex-col gap-1 border-b border-[var(--color-ink)]/10 pb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-ink)]/50">Lunia</p>
        <h1 className="font-[family-name:var(--font-display)] text-2xl">{title}</h1>
      </header>
      <div className="flex flex-col gap-4 text-[0.95rem] leading-relaxed">
        {rest.map((para, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {para}
          </p>
        ))}
      </div>
      <dl className="grid gap-4 border-t border-[var(--color-ink)]/10 pt-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-[var(--color-ink)]/55">{labels.signedBy}</dt>
          <dd className="font-medium">{signerName}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-ink)]/55">{labels.signedAt}</dt>
          <dd className="font-medium">{signedAtLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-ink)]/55">{labels.version}</dt>
          <dd className="font-medium">{version}</dd>
        </div>
      </dl>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing for next/image to optimize */}
      <img src={signatureData} alt={labels.signedBy} className="h-28 w-auto max-w-full self-start border-b border-[var(--color-ink)]/30 object-contain" />
      {footer}
    </article>
  );
}
