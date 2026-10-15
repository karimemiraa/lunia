import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getTaxSettings, taxSettingsIssues } from "@/modules/billing/settings";
import { onlinePaymentsConfigured } from "@/modules/billing/payments/links";
import { getSecret } from "@/modules/platform/secrets";
import { TaxSettingsForm } from "./TaxSettingsForm";
import { getStaffT } from "../../_i18n/display";

// Front desk (billing:manage) can see the seller details printed on invoices;
// changing them takes settings:manage or accounting:manage (see the action).
export default async function TaxSettingsPage() {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const canEdit = user.permissions.has(PERMISSIONS.SETTINGS_MANAGE) || user.permissions.has(PERMISSIONS.ACCOUNTING_MANAGE);
  const [settings, payConfigured, webhookSecret] = await Promise.all([getTaxSettings(), onlinePaymentsConfigured(), getSecret("PAYMENT_WEBHOOK_SECRET")]);
  const issues = taxSettingsIssues(settings);
  const t = await getStaffT();

  return (
    <AdminShell
      user={user}
      title="Tax & invoice settings"
      description="Seller identity and VAT details printed on every tax invoice and encoded in the ZATCA QR."
      actions={
        <Link href="/admin/billing" className="lunia-btn lunia-btn-ghost">
          {t("Back to invoices")}
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        {issues.length > 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-[var(--color-gold)]/45 bg-[var(--color-gold)]/10 px-4 py-3 text-sm">
            {t("Invoices can’t be issued until these are filled in: {items}.", { items: issues.map((i) => t(i)).join(t(", ")) })}
          </p>
        ) : (
          <p className="rounded-[var(--radius-sm)] bg-[var(--color-teal)]/15 px-4 py-3 text-sm">{t("Ready to issue ZATCA Phase 1 simplified tax invoices.")}</p>
        )}
        {payConfigured && !webhookSecret && (
          <p className="rounded-[var(--radius-sm)] border border-[var(--color-gold)]/45 bg-[var(--color-gold)]/10 px-4 py-3 text-sm" data-testid="webhook-secret-missing">
            {t("Online payments are on but the webhook secret isn’t set, so Moyasar’s payment notifications are refused and online payments are only picked up through the invoice callback. Copy the secret token from the Moyasar dashboard (Webhooks) into Superadmin → Payments.")}
          </p>
        )}
        <TaxSettingsForm initial={settings} canEdit={canEdit} />
        <section className="lunia-card flex flex-col gap-2 p-5 text-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">{t("E-invoicing & online payments")}</h2>
          <p>
            <span className="font-medium">{t("ZATCA Phase 1")}</span> {t("(QR on every invoice): active once the details above are complete.")}
          </p>
          <p>
            <span className="font-medium">{t("ZATCA Phase 2")}</span>{" "}
            {t("(Fatoora integration): invoices already carry the UBL XML, UUID, counter and hash chain. Reporting needs a production CSID from the Fatoora portal (owner OTP) — not connected yet, so documents stay “not submitted”.")}
          </p>
          <p>
            <span className="font-medium">{t("Online pay links")}</span>: {payConfigured ? t("connected (Moyasar).") : t("not configured — set Superadmin → Payments (provider moyasar, secret key, webhook secret).")}
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
