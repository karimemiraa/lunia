import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { verifyInvoiceToken } from "@/modules/billing/token";
import { getInvoiceDocument } from "@/modules/billing/document";
import { formatAmount } from "@/modules/billing/money";
import { InvoiceDocumentView } from "@/components/billing/InvoiceDocumentView";
import { PrintButton } from "@/components/billing/PrintButton";

interface InvoiceViewProps {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ format?: string; paid?: string }>;
}

export async function generateMetadata({ params }: InvoiceViewProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale === "en" ? "en" : "ar", namespace: "invoices.meta" });
  // Private documents: never indexed, never leak the token via referrer.
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

// The customer's invoice, reached through the HMAC-signed link we send them.
export default async function InvoiceViewPage({ params, searchParams }: InvoiceViewProps) {
  const { locale: rawLocale, token } = await params;
  const locale = rawLocale === "en" ? "en" : "ar";
  const { format: rawFormat, paid } = await searchParams;
  const format = rawFormat === "receipt" ? "receipt" : "a4";
  const t = await getTranslations({ locale, namespace: "invoices.view" });

  const id = verifyInvoiceToken(decodeURIComponent(token));
  const doc = id ? await getInvoiceDocument(id) : null;
  if (!doc || doc.status === "DRAFT" || doc.status === "VOID") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <p className="lunia-card w-full p-6 text-center text-sm">{doc?.status === "DRAFT" ? t("draft") : t("notFound")}</p>
      </main>
    );
  }

  const payLink =
    doc.kind === "INVOICE" && doc.balanceMinor > 0
      ? await prisma.paymentLink.findFirst({
          where: { invoiceId: doc.id, status: "PENDING", url: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { url: true },
        })
      : null;
  const base = `/${locale}/invoice/${encodeURIComponent(token)}`;

  return (
    <main>
      <InvoiceDocumentView
        doc={doc}
        format={format}
        toolbar={
          <div className="invoice-no-print flex w-full max-w-[210mm] flex-col items-center gap-3 px-4">
            {paid === "1" && doc.balanceMinor > 0 && (
              <p className="w-full rounded-[var(--radius-sm)] bg-[var(--color-teal)]/20 px-4 py-3 text-center text-sm">{t("paymentReceived")}</p>
            )}
            {doc.kind === "INVOICE" && doc.balanceMinor === 0 && (
              <p className="w-full rounded-[var(--radius-sm)] bg-[var(--color-teal)]/20 px-4 py-3 text-center text-sm">{t("paidInFull")}</p>
            )}
            {doc.balanceMinor > 0 && (
              <p className="text-sm font-medium">{t("balanceDue", { amount: `${formatAmount(doc.balanceMinor)} SAR` })}</p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {payLink?.url && (
                <a href={payLink.url} rel="noreferrer" className="lunia-btn lunia-btn-forest min-h-[44px]">
                  {t("payOnline")}
                </a>
              )}
              <PrintButton label={t("print")} className="lunia-btn lunia-btn-forest-outline min-h-[44px]" />
              <a href={format === "a4" ? `${base}?format=receipt` : base} className="lunia-btn lunia-btn-ghost min-h-[44px]">
                {format === "a4" ? t("receipt") : t("a4")}
              </a>
            </div>
          </div>
        }
      />
    </main>
  );
}
