"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "../../_components/Modal";
import { formatAmount, parseSarToMinor } from "@/modules/billing/money";
import { clientPackagesAction, createCreditNoteAction, createPayLinkAction, recordPaymentAction, sendInvoiceAction } from "../actions";
import { METHOD_LABELS, POS_STEPS } from "../ui";
import { Stepper, SectionCard } from "../../_ui/Layout";
import { MoneyInput } from "../../_ui/MoneyInput";
import { Field, SelectField, CheckboxField } from "../../_ui/Field";
import { InlineStatus, Spinner } from "../../_ui/Form";
import { StatusPill } from "../../_ui/StatusPill";
import { useStaffT } from "../../_i18n/StaffI18n";
import type { T } from "../../_i18n/t";

interface CreditableLine {
  sortOrder: number;
  description: string;
  qty: number;
  remainingQty: number;
  totalMinor: number;
  isProduct: boolean;
}

interface Props {
  invoiceId: string;
  balanceMinor: number;
  refundableMinor: number;
  clientProfileId: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
  payConfigured: boolean;
  pendingLinkUrl: string | null;
  publicUrl: string | null;
  creditable: CreditableLine[];
  lineSumMinor: number;
  totalMinor: number;
  /** Payments already on the invoice (for the split summary). */
  payments?: { method: string; amountMinor: number }[];
}

const PAY_METHODS = ["CASH", "MADA", "CARD", "APPLE_PAY", "BANK_TRANSFER", "GIFT_CARD", "PACKAGE", "OTHER"] as const;
const REFUND_METHODS = ["CASH", "MADA", "CARD", "APPLE_PAY", "BANK_TRANSFER", "OTHER"] as const;
type PayMethod = (typeof PAY_METHODS)[number];
const toInput = (minor: number) => (minor / 100).toFixed(2);
const methodLabel = (t: T, m: string) => (METHOD_LABELS[m] ? t(METHOD_LABELS[m]) : m);

/** Cash quick amounts: exact, then the next round notes above it. */
function quickTenders(balanceMinor: number): number[] {
  const out = new Set<number>([balanceMinor]);
  for (const step of [5000, 10000, 20000, 50000]) {
    const up = Math.ceil(balanceMinor / step) * step;
    if (up > balanceMinor) out.add(up);
  }
  return [...out].slice(0, 5);
}

/**
 * Issued-invoice panel for the POS: the checkout stepper, an inline "take
 * payment" form (split payments, quick cash amounts, change due), prominent
 * print/receipt once settled, then send. Credit notes stay behind a dialog.
 */
export function IssuedActions(props: Props) {
  const router = useRouter();
  const t = useStaffT();
  const [creditOpen, setCreditOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [linkUrl, setLinkUrl] = useState(props.pendingLinkUrl);
  const [sent, setSent] = useState(false);

  const settled = props.balanceMinor <= 0;
  const step = sent ? POS_STEPS.length : settled ? 3 : 2;
  const canCredit = props.creditable.some((l) => l.remainingQty > 0);

  function done(message: string) {
    setNotice(message);
    setError(null);
    router.refresh();
  }

  function makeLink() {
    setError(null);
    startTransition(async () => {
      const res = await createPayLinkAction(props.invoiceId);
      if (!res.ok) setError(res.error);
      else {
        setLinkUrl(res.url);
        setNotice(t("Pay link ready — copy it or send the invoice with the link included."));
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Stepper steps={POS_STEPS.map((s) => ({ ...s, label: t(s.label) }))} current={step} />

      {notice && <InlineStatus success={notice} />}
      {error && <InlineStatus error={error} />}

      {settled ? (
        <SectionCard title={t("Paid in full")} actions={<StatusPill tone="success" dot>{t("Settled")}</StatusPill>}>
          {props.payments && props.payments.length > 1 && (
            <p className="mb-3 text-xs text-[var(--color-ink)]/60">{t("Split: {parts}", { parts: props.payments.map((p) => `${methodLabel(t, p.method)} ${formatAmount(p.amountMinor)}`).join(" + ") })}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/admin/billing/${props.invoiceId}/print?format=receipt`} target="_blank" className="lunia-btn lunia-btn-forest min-h-12">
              {t("Print receipt")}
            </Link>
            <Link href={`/admin/billing/${props.invoiceId}/print`} target="_blank" className="lunia-btn lunia-btn-forest-outline min-h-12">
              {t("Print A4")}
            </Link>
          </div>
        </SectionCard>
      ) : (
        <PaymentForm {...props} onDone={done} />
      )}

      <SendCard {...props} linkUrl={linkUrl} onMakeLink={makeLink} linkPending={pending} onDone={(m) => { setSent(true); done(m); }} />

      {(linkUrl || props.publicUrl) && (
        <div className="flex flex-col gap-1 px-1 text-xs text-[var(--color-ink)]/60">
          {props.publicUrl && <CopyRow label={t("Customer invoice link")} value={props.publicUrl} />}
          {linkUrl && <CopyRow label={t("Pay link")} value={linkUrl} />}
        </div>
      )}

      {canCredit && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] px-4 py-3 text-xs text-[var(--color-ink)]/60">
          <span>{t("Returned or wrong? Issued invoices are reversed with a credit note.")}</span>
          <button type="button" onClick={() => setCreditOpen(true)} className="lunia-btn lunia-btn-danger lunia-btn-sm min-h-11 shrink-0">
            {t("Credit note")}
          </button>
        </div>
      )}

      {creditOpen && (
        <CreditDialog
          {...props}
          onClose={() => setCreditOpen(false)}
          onDone={(m) => {
            setCreditOpen(false);
            done(m);
          }}
        />
      )}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const t = useStaffT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{label}:</span>
      <a href={value} target="_blank" rel="noreferrer" dir="ltr" className="max-w-full truncate text-[var(--color-teal-ink)] underline sm:max-w-md">
        {value}
      </a>
      <button type="button" onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true))} className="min-h-9 rounded-full border border-[var(--line-strong)] px-3">
        {copied ? t("Copied") : t("Copy")}
      </button>
    </div>
  );
}

function MethodTiles<T extends string>({ methods, value, onChange, labelId }: { methods: readonly T[]; value: T; onChange: (m: T) => void; labelId: string }) {
  const t = useStaffT();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
      {methods.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={`min-h-11 rounded-[var(--radius-sm)] border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${
            value === m ? "border-[var(--color-teal)] bg-[var(--color-teal)] font-medium text-[var(--color-ink)]" : "border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
          }`}
        >
          {methodLabel(t, m)}
        </button>
      ))}
    </div>
  );
}

function PaymentForm(props: Props & { onDone: (m: string) => void }) {
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [amount, setAmount] = useState(toInput(props.balanceMinor));
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [code, setCode] = useState("");
  const [packages, setPackages] = useState<{ id: string; name: string; sessionsRemaining: number }[] | null>(null);
  const [packageId, setPackageId] = useState("");
  const t = useStaffT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountMinor = parseSarToMinor(amount || "");
  const tenderedMinor = tendered ? parseSarToMinor(tendered) : null;
  const change = method === "CASH" && tenderedMinor !== null && amountMinor !== null ? tenderedMinor - Math.min(amountMinor, props.balanceMinor) : 0;
  const isPartial = amountMinor !== null && amountMinor > 0 && amountMinor < props.balanceMinor;
  const paidSoFar = props.payments?.reduce((s, p) => s + p.amountMinor, 0) ?? 0;

  function pickMethod(m: PayMethod) {
    setMethod(m);
    if (m === "PACKAGE" && packages === null && props.clientProfileId) {
      clientPackagesAction(props.clientProfileId).then((rows) => {
        setPackages(rows);
        if (rows[0]) setPackageId(rows[0].id);
      });
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (amountMinor === null || amountMinor <= 0) return setError(t("Enter the amount, e.g. 250 or 249.50."));
    if (amountMinor > props.balanceMinor) return setError(t("Amount is more than the {amount} SAR due.", { amount: formatAmount(props.balanceMinor) }));
    if (method === "CASH" && tendered && (tenderedMinor === null || tenderedMinor < amountMinor)) {
      return setError(t("Cash received must cover the amount."));
    }
    startTransition(async () => {
      const res = await recordPaymentAction({
        invoiceId: props.invoiceId,
        method,
        amountMinor,
        tenderedMinor: method === "CASH" && tenderedMinor ? tenderedMinor : undefined,
        reference: reference || undefined,
        giftCardCode: method === "GIFT_CARD" ? code : undefined,
        packagePurchaseId: method === "PACKAGE" ? packageId : undefined,
      });
      if (!res.ok) setError(res.error);
      else {
        const remaining = props.balanceMinor - amountMinor;
        setAmount(toInput(Math.max(0, remaining)));
        setTendered("");
        setReference("");
        setCode("");
        props.onDone(
          res.changeMinor > 0
            ? t("Payment recorded. Give {amount} SAR change.", { amount: formatAmount(res.changeMinor) })
            : remaining > 0
              ? t("{method} {amount} recorded — {remaining} SAR still due.", { method: methodLabel(t, method), amount: formatAmount(amountMinor), remaining: formatAmount(remaining) })
              : t("Payment recorded. Paid in full."),
        );
      }
    });
  }

  return (
    <SectionCard
      title={t("Take payment")}
      actions={
        <span className="text-end">
          <span className="block text-[0.65rem] uppercase tracking-wide text-[var(--color-ink)]/50">{t("Balance due")}</span>
          <span className="text-2xl font-medium tabular-nums">
            {formatAmount(props.balanceMinor)} <span className="text-sm text-[var(--color-ink)]/55">{t("SAR")}</span>
          </span>
        </span>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="pos-payment-form">
        {paidSoFar > 0 && props.payments && (
          <p className="text-xs text-[var(--color-ink)]/60">
            {t("Already paid: {parts}", { parts: props.payments.map((p) => `${methodLabel(t, p.method)} ${formatAmount(p.amountMinor)}`).join(" + ") })}
          </p>
        )}
        <div>
          <p id="pay-method-label" className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/65">
            {t("Method")}
          </p>
          <MethodTiles methods={PAY_METHODS.filter((m) => m !== "PACKAGE" || props.clientProfileId)} value={method} onChange={pickMethod} labelId="pay-method-label" />
        </div>

        <MoneyInput label={t("Amount")} value={amount} onChange={(v) => setAmount(v)} required help={isPartial ? t("Partial payment — the rest can be taken with another method.") : t("Lower the amount to split across methods.")} />

        {method === "CASH" && (
          <div className="flex flex-col gap-2">
            <MoneyInput label={t("Cash received")} value={tendered} onChange={(v) => setTendered(v)} placeholder={t("Optional")} />
            <div className="flex flex-wrap gap-2" aria-label={t("Quick amounts")}>
              {quickTenders(amountMinor ?? props.balanceMinor).map((m, i) => (
                <button key={m} type="button" onClick={() => setTendered(toInput(m))} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 tabular-nums">
                  {i === 0 ? t("Exact") : formatAmount(m)}
                </button>
              ))}
            </div>
            {change > 0 && (
              <p role="status" className="rounded-[var(--radius-sm)] bg-[var(--color-teal)]/20 px-4 py-3 text-base font-medium tabular-nums">
                {t("Change due: {amount} SAR", { amount: formatAmount(change) })}
              </p>
            )}
          </div>
        )}
        {method === "GIFT_CARD" && <Field label={t("Gift card code")} name="giftCardCode" required dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" inputClassName="font-mono uppercase" autoComplete="off" />}
        {method === "PACKAGE" && (
          <SelectField label={t("Package")} name="packagePurchaseId" value={packageId} onChange={(e) => setPackageId(e.target.value)} help={t("One session is deducted; enter the value it covers.")} error={packages?.length === 0 ? t("No active packages for this customer.") : undefined}>
            {(packages ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {t("{name} ({count} left)", { name: p.name, count: p.sessionsRemaining })}
              </option>
            ))}
          </SelectField>
        )}
        {!["CASH", "GIFT_CARD", "PACKAGE"].includes(method) && <Field label={t("Reference")} name="reference" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("Terminal receipt no. (optional)")} autoComplete="off" />}

        {error && <InlineStatus error={error} />}
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className="lunia-btn lunia-btn-forest min-h-12 w-full text-base disabled:opacity-50">
          {pending && <Spinner />}
          {amountMinor !== null && amountMinor > 0 ? t("Record {amount} SAR", { amount: formatAmount(amountMinor) }) : t("Record payment")}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/admin/billing/${props.invoiceId}/print?format=receipt`} target="_blank" className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
            {t("Print receipt")}
          </Link>
          <Link href={`/admin/billing/${props.invoiceId}/print`} target="_blank" className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
            {t("Print A4")}
          </Link>
        </div>
      </form>
    </SectionCard>
  );
}

function SendCard(props: Props & { linkUrl: string | null; onMakeLink: () => void; linkPending: boolean; onDone: (m: string) => void }) {
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">(props.hasPhone ? "whatsapp" : "email");
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [withLink, setWithLink] = useState(props.payConfigured && props.balanceMinor > 0);
  const t = useStaffT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await sendInvoiceAction(props.invoiceId, channel, withLink, locale);
      if (!res.ok) setError(res.error);
      else props.onDone(res.recipient ? t("Invoice sent to {recipient}.", { recipient: res.recipient }) : t("Invoice sent."));
    });
  }

  const channels = [
    { id: "whatsapp" as const, label: t("WhatsApp"), ok: props.hasPhone },
    { id: "sms" as const, label: t("SMS"), ok: props.hasPhone },
    { id: "email" as const, label: t("Email"), ok: props.hasEmail },
  ];
  const anyChannel = channels.some((c) => c.ok);

  return (
    <SectionCard title={t("Send to customer")} description={anyChannel ? undefined : t("No phone or email on this invoice — link a customer or add a phone to send.")}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div role="radiogroup" aria-label={t("Channel")} className="grid grid-cols-3 gap-2">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={channel === c.id}
              disabled={!c.ok}
              onClick={() => setChannel(c.id)}
              className={`min-h-11 rounded-[var(--radius-sm)] border px-3 text-sm disabled:opacity-40 ${channel === c.id ? "border-[var(--color-teal)] bg-[var(--color-teal)] font-medium" : "border-[var(--line-strong)] hover:bg-[var(--surface-2)]"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <SelectField label={t("Language")} name="locale" value={locale} onChange={(e) => setLocale(e.target.value as "ar" | "en")}>
          <option value="ar">{t("Arabic")}</option>
          <option value="en">{t("English")}</option>
        </SelectField>
        {props.balanceMinor > 0 && (
          <CheckboxField
            label={t("Include an online pay link for {amount} SAR", { amount: formatAmount(props.balanceMinor) })}
            name="withLink"
            checked={withLink}
            disabled={!props.payConfigured}
            onChange={(e) => setWithLink(e.target.checked)}
            help={props.payConfigured ? undefined : t("No payment gateway configured (Superadmin → Payments).")}
          />
        )}
        {error && <InlineStatus error={error} />}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !anyChannel} aria-busy={pending || undefined} className="lunia-btn lunia-btn-forest-outline min-h-11 flex-1 disabled:opacity-50">
            {pending && <Spinner />}
            {t("Send {channel}", { channel: channels.find((c) => c.id === channel)?.label })}
          </button>
          {props.balanceMinor > 0 && props.payConfigured && (
            <button type="button" disabled={props.linkPending} onClick={props.onMakeLink} className="lunia-btn lunia-btn-ghost min-h-11 disabled:opacity-50">
              {props.linkUrl ? t("Refresh pay link") : t("Create pay link")}
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--color-ink)]/50">{t("Uses the Invoice template (Communications → Templates). Without a messaging provider it is logged only.")}</p>
      </form>
    </SectionCard>
  );
}

function CreditDialog(props: Props & { onClose: () => void; onDone: (m: string) => void }) {
  const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries(props.creditable.map((l) => [l.sortOrder, String(l.remainingQty)])));
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [refund, setRefund] = useState(props.refundableMinor > 0);
  const [refundMethod, setRefundMethod] = useState<(typeof REFUND_METHODS)[number]>("CASH");
  const t = useStaffT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = props.creditable.map((l) => ({ l, q: Number.parseInt(qty[l.sortOrder] ?? "0", 10) || 0 })).filter(({ q }) => q > 0);
  // Estimate only (the server computes the exact amounts incl. the invoice discount share).
  const ratio = props.lineSumMinor > 0 ? props.totalMinor / props.lineSumMinor : 1;
  const estimate = Math.round(chosen.reduce((s, { l, q }) => s + (l.totalMinor * q) / l.qty, 0) * ratio);
  const refundDefault = Math.min(estimate, props.refundableMinor);
  const [refundAmount, setRefundAmount] = useState("");
  const refundMinor = refundAmount ? parseSarToMinor(refundAmount) : refundDefault;
  const hasProducts = chosen.some(({ l }) => l.isProduct);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (chosen.length === 0) return setError(t("Choose at least one item to credit."));
    if (chosen.some(({ l, q }) => q > l.remainingQty)) return setError(t("A quantity is more than what's left to credit."));
    if (reason.trim().length < 3) return setError(t("Give a short reason (printed on the credit note)."));
    if (refund && (refundMinor === null || refundMinor <= 0)) return setError(t("Enter a valid refund amount."));
    startTransition(async () => {
      const res = await createCreditNoteAction({
        originalInvoiceId: props.invoiceId,
        lines: chosen.map(({ l, q }) => ({ sortOrder: l.sortOrder, qty: q })),
        reason,
        restock,
        refund: refund && refundMinor ? { method: refundMethod, amountMinor: refundMinor } : undefined,
      });
      if (!res.ok) setError(res.error);
      else props.onDone(t("Credit note {number} issued.", { number: res.number }));
    });
  }

  return (
    <Modal title={t("Credit note")} onClose={props.onClose} widthClass="max-w-2xl">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink)]/65">{t("Issued invoices can’t be edited. A credit note reverses all or part of it (and returns products to stock).")}</p>
        <ul className="flex flex-col divide-y divide-[var(--line)]">
          {props.creditable.map((l) => (
            <li key={l.sortOrder} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{l.description}</span>
                <span className="text-xs text-[var(--color-ink)]/50">
                  {t("{remaining} of {qty} left to credit", { remaining: l.remainingQty, qty: l.qty })}
                </span>
              </span>
              <input
                inputMode="numeric"
                dir="ltr"
                aria-label={t("Quantity to credit for {item}", { item: l.description })}
                disabled={l.remainingQty === 0}
                value={qty[l.sortOrder] ?? "0"}
                onChange={(e) => setQty((s) => ({ ...s, [l.sortOrder]: e.target.value }))}
                className="lunia-input min-h-11 w-20 text-center text-base tabular-nums md:text-sm"
              />
            </li>
          ))}
        </ul>
        <p className="text-sm">
          {t("Credit amount ≈")} <span className="font-medium tabular-nums">{formatAmount(estimate)} {t("SAR")}</span>
        </p>
        <Field label={t("Reason")} name="reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. Product returned unopened")} help={t("Printed on the credit note.")} />
        {hasProducts && <CheckboxField label={t("Return credited products to stock")} name="restock" checked={restock} onChange={(e) => setRestock(e.target.checked)} />}
        {props.refundableMinor > 0 && (
          <div className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] p-3">
            <CheckboxField label={t("Refund the customer now (up to {amount} SAR paid)", { amount: formatAmount(props.refundableMinor) })} name="refund" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
            {refund && (
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label={t("Refund method")} name="refundMethod" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as (typeof REFUND_METHODS)[number])}>
                  {REFUND_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {methodLabel(t, m)}
                    </option>
                  ))}
                </SelectField>
                <MoneyInput label={t("Refund amount")} value={refundAmount} onChange={(v) => setRefundAmount(v)} placeholder={toInput(refundDefault)} />
              </div>
            )}
          </div>
        )}
        {error && <InlineStatus error={error} />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={props.onClose} className="lunia-btn lunia-btn-ghost min-h-11">
            {t("Cancel")}
          </button>
          <button type="submit" disabled={pending} aria-busy={pending || undefined} className="lunia-btn lunia-btn-danger min-h-11 disabled:opacity-50">
            {pending && <Spinner />}
            {t("Issue credit note")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
