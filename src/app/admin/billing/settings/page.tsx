import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getTaxSettings, taxSettingsIssues } from "@/modules/billing/settings";
import { onlinePaymentsConfigured } from "@/modules/billing/payments/links";
import { TaxSettingsForm } from "./TaxSettingsForm";

// Front desk (billing:manage) can see the seller details printed on invoices;
// changing them takes settings:manage or accounting:manage (see the action).
export default async function TaxSettingsPage() {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const canEdit = user.permissions.has(PERMISSIONS.SETTINGS_MANAGE) || user.permissions.has(PERMISSIONS.ACCOUNTING_MANAGE);
  const [settings, payConfigured] = await Promise.all([getTaxSettings(), onlinePaymentsConfigured()]);
  const issues = taxSettingsIssues(settings);

  return (
    <AdminShell
      user={user}
      title="Tax & invoice settings"
      description="Seller identity and VAT details printed on every tax invoice and encoded in the ZATCA QR."
      actions={
        <Link href="/admin/billing" className="lunia-btn lunia-btn-ghost">
          Back to invoices
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        {issues.length > 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-[var(--color-gold)]/45 bg-[var(--color-gold)]/10 px-4 py-3 text-sm">
            Invoices can&rsquo;t be issued until these are filled in: {issues.join(", ")}.
          </p>
        ) : (
          <p className="rounded-[var(--radius-sm)] bg-[var(--color-teal)]/15 px-4 py-3 text-sm">Ready to issue ZATCA Phase 1 simplified tax invoices.</p>
        )}
        <TaxSettingsForm initial={settings} canEdit={canEdit} />
        <section className="lunia-card flex flex-col gap-2 p-5 text-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">E-invoicing & online payments</h2>
          <p>
            <span className="font-medium">ZATCA Phase 1</span> (QR on every invoice): active once the details above are complete.
          </p>
          <p>
            <span className="font-medium">ZATCA Phase 2</span> (Fatoora integration): invoices already carry the UBL XML, UUID, counter and hash chain.
            Reporting needs a production CSID from the Fatoora portal (owner OTP) — not connected yet, so documents stay &ldquo;not submitted&rdquo;.
          </p>
          <p>
            <span className="font-medium">Online pay links</span>: {payConfigured ? "connected (Moyasar)." : "not configured — set Superadmin → Payments (provider moyasar, secret key, webhook secret)."}
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
