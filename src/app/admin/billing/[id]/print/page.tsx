import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getInvoiceDocument } from "@/modules/billing/document";
import { InvoiceDocumentView } from "@/components/billing/InvoiceDocumentView";
import { PrintButton } from "@/components/billing/PrintButton";

interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}

// Bare print view (no admin chrome): A4 by default, ?format=receipt for the
// 80 mm thermal printer.
export default async function InvoicePrintPage({ params, searchParams }: PrintPageProps) {
  await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const { id } = await params;
  const format = (await searchParams).format === "receipt" ? "receipt" : "a4";
  const doc = await getInvoiceDocument(id);
  if (!doc) notFound();

  return (
    <div className="min-h-screen bg-[var(--surface-2)]">
      <InvoiceDocumentView
        doc={doc}
        format={format}
        toolbar={
          <div className="invoice-no-print flex flex-wrap items-center justify-center gap-2">
            <Link href={`/admin/billing/${id}`} className="lunia-btn lunia-btn-ghost min-h-[44px]">
              Back to invoice
            </Link>
            <Link href={`/admin/billing/${id}/print${format === "a4" ? "?format=receipt" : ""}`} className="lunia-btn lunia-btn-ghost min-h-[44px]">
              {format === "a4" ? "80 mm receipt" : "A4"}
            </Link>
            <PrintButton label="Print / Save as PDF" />
          </div>
        }
      />
    </div>
  );
}
