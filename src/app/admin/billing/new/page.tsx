import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { createDraftFromBooking } from "@/modules/billing/invoices";
import { getTaxSettings, taxSettingsIssues } from "@/modules/billing/settings";
import { quickPicks } from "@/modules/billing/lookup";
import { staffOptions } from "../staffOptions";
import { InvoiceEditor } from "../InvoiceEditor";
import { InlineStatus } from "../../_ui/Form";
import { getStaffLocale, getStaffT } from "../../_i18n/display";

interface NewInvoicePageProps {
  searchParams: Promise<{ booking?: string; client?: string }>;
}

// /admin/billing/new?booking=ID — "Checkout" from the calendar: creates (or
// reuses) the booking's draft and opens it. Without a booking it's a blank
// walk-in invoice, optionally pre-linked to a customer (?client=ID).
export default async function NewInvoicePage({ searchParams }: NewInvoicePageProps) {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const { booking, client } = await searchParams;
  const t = await getStaffT();

  if (booking) {
    let id: string | null = null;
    let error: string | null = null;
    try {
      id = (await createDraftFromBooking(booking, user.id)).id;
    } catch (err) {
      error = t(err instanceof Error ? err.message : "Could not start checkout for this booking.");
    }
    if (id) redirect(`/admin/billing/${id}`);
    return (
      <AdminShell user={user} title="Checkout">
        <InlineStatus error={error} />
        <Link href="/admin/billing/new" className="lunia-btn lunia-btn-forest mt-4">
          {t("Start a walk-in invoice instead")}
        </Link>
      </AdminShell>
    );
  }

  const [settings, picks, profile] = await Promise.all([
    getTaxSettings(),
    quickPicks(8),
    client
      ? prisma.clientProfile.findUnique({ where: { id: client }, select: { id: true, fullName: true, user: { select: { phone: true } } } })
      : null,
  ]);

  return (
    <AdminShell user={user} title="New sale" description="Scan or search to add items, take payment, send the receipt.">
      <InvoiceEditor
        invoiceId={null}
        quickPicks={picks}
        staff={await staffOptions(await getStaffLocale())}
        pricesIncludeVat={settings.pricesIncludeVat}
        defaultVatRateBp={settings.defaultVatRateBp}
        settingsIssues={taxSettingsIssues(settings)}
        initial={{
          clientProfileId: profile?.id ?? null,
          bookingId: null,
          customerName: profile?.fullName ?? "",
          customerPhone: profile?.user.phone ?? "",
          customerVatNumber: "",
          notes: "",
          lines: [],
          invoiceDiscountMinor: 0,
        }}
      />
    </AdminShell>
  );
}
