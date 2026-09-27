"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_components/Modal";
import { formatAmount, parseSarToMinor } from "@/modules/billing/money";
import { clientPackagesAction, createCreditNoteAction, createPayLinkAction, recordPaymentAction, sendInvoiceAction } from "../actions";
import { METHOD_LABELS } from "../ui";

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
}

type Dialog = "pay" | "send" | "credit" | null;

const PAY_METHODS = ["CASH", "MADA", "CARD", "APPLE_PAY", "BANK_TRANSFER", "GIFT_CARD", "PACKAGE", "OTHER"] as const;
const REFUND_METHODS = ["CASH", "MADA", "CARD", "APPLE_PAY", "BANK_TRANSFER", "OTHER"] as const;
const toInput = (minor: number) => (minor / 100).toFixed(2);

export function IssuedActions(props: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [linkUrl, setLinkUrl] = useState(props.pendingLinkUrl);

  const canCredit = props.creditable.some((l) => l.remainingQty > 0);

  function done(message: string) {
    setDialog(null);
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
        setNotice("Pay link ready — copy it or send the invoice with the link included.");
        router.refresh();
      }
    });
  }

  return (
    <section className="lunia-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        {props.balanceMinor > 0 && (
          <button type="button" onClick={() => setDialog("pay")} className="lunia-btn lunia-btn-forest min-h-[44px]">
            Take payment · {formatAmount(props.balanceMinor)} due
          </button>
        )}
        <button type="button" onClick={() => setDialog("send")} className="lunia-btn lunia-btn-forest-outline min-h-[44px]">
          Send to customer
        </button>
        {props.balanceMinor > 0 &&
          (props.payConfigured ? (
            <button type="button" disabled={pending} onClick={makeLink} className="lunia-btn lunia-btn-forest-outline min-h-[44px] disabled:opacity-50">
              {linkUrl ? "Refresh pay link" : "Create pay link"}
            </button>
          ) : (
            <span className="inline-flex min-h-[44px] items-center rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] px-4 text-xs text-[var(--color-ink)]/55">
              Online pay links: set up a gateway in Superadmin → Payments
            </span>
          ))}
        {canCredit && (
          <button type="button" onClick={() => setDialog("credit")} className="lunia-btn lunia-btn-danger min-h-[44px]">
            Credit note / refund
          </button>
        )}
      </div>

      {(linkUrl || props.publicUrl) && (
        <div className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/60">
          {props.publicUrl && <CopyRow label="Customer invoice link" value={props.publicUrl} />}
          {linkUrl && <CopyRow label="Pay link" value={linkUrl} />}
        </div>
      )}
      {notice && <p className="text-sm text-[var(--color-teal-ink)]">{notice}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {dialog === "pay" && <PaymentDialog {...props} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "send" && <SendDialog {...props} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "credit" && <CreditDialog {...props} onClose={() => setDialog(null)} onDone={done} />}
    </section>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{label}:</span>
      <a href={value} target="_blank" rel="noreferrer" className="max-w-full truncate text-[var(--color-teal-ink)] underline sm:max-w-md">
        {value}
      </a>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true))}
        className="min-h-[36px] rounded-full border border-[var(--line-strong)] px-3"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const labelCls = "flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55";
const inputCls = "lunia-input min-h-[44px] normal-case tracking-normal";

function PaymentDialog(props: Props & { onClose: () => void; onDone: (m: string) => void }) {
  const [method, setMethod] = useState<(typeof PAY_METHODS)[number]>("CASH");
  const [amount, setAmount] = useState(toInput(props.balanceMinor));
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [code, setCode] = useState("");
  const [packages, setPackages] = useState<{ id: string; name: string; sessionsRemaining: number }[] | null>(null);
  const [packageId, setPackageId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountMinor = parseSarToMinor(amount || "");
  const tenderedMinor = tendered ? parseSarToMinor(tendered) : null;
  const change = method === "CASH" && tenderedMinor !== null && amountMinor !== null ? tenderedMinor - Math.min(amountMinor, props.balanceMinor) : 0;

  function pickMethod(m: (typeof PAY_METHODS)[number]) {
    setMethod(m);
    if (m === "PACKAGE" && packages === null && props.clientProfileId) {
      clientPackagesAction(props.clientProfileId).then((rows) => {
        setPackages(rows);
        if (rows[0]) setPackageId(rows[0].id);
      });
    }
  }

  function submit() {
    setError(null);
    if (amountMinor === null || amountMinor <= 0) return setError("Enter the amount, e.g. 250 or 249.50.");
    if (method === "CASH" && tendered && (tenderedMinor === null || tenderedMinor < amountMinor)) {
      return setError("Cash received must cover the amount.");
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
      else props.onDone(res.changeMinor > 0 ? `Payment recorded. Give ${formatAmount(res.changeMinor)} SAR change.` : "Payment recorded.");
    });
  }

  return (
    <Modal title="Take payment" onClose={props.onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAY_METHODS.filter((m) => m !== "PACKAGE" || props.clientProfileId).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => pickMethod(m)}
              className={`min-h-[44px] rounded-[var(--radius-sm)] border px-3 text-sm ${
                method === m ? "border-[var(--color-forest)] bg-[var(--color-forest)] text-[var(--color-cream)]" : "border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Amount (SAR)
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} tabular-nums`} />
          </label>
          {method === "CASH" && (
            <label className={labelCls}>
              Cash received (optional)
              <input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="e.g. 500" className={`${inputCls} tabular-nums`} />
            </label>
          )}
          {method === "GIFT_CARD" && (
            <label className={labelCls}>
              Gift card code
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" className={`${inputCls} font-mono`} />
            </label>
          )}
          {method === "PACKAGE" && (
            <label className={labelCls}>
              Package
              <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className={inputCls}>
                {(packages ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sessionsRemaining} left)
                  </option>
                ))}
              </select>
              {packages?.length === 0 && <span className="normal-case tracking-normal text-red-700">No active packages for this customer.</span>}
            </label>
          )}
          {!["CASH", "GIFT_CARD", "PACKAGE"].includes(method) && (
            <label className={labelCls}>
              Reference (optional)
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Terminal receipt no." className={inputCls} />
            </label>
          )}
        </div>
        {method === "CASH" && change > 0 && (
          <p className="rounded-[var(--radius-sm)] bg-[var(--color-teal)]/15 px-4 py-3 text-base font-medium">Change due: {formatAmount(change)} SAR</p>
        )}
        {method === "PACKAGE" && <p className="text-xs text-[var(--color-ink)]/55">One session is deducted from the package; enter the value it covers.</p>}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className="lunia-btn lunia-btn-ghost min-h-[44px]">
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={submit} className="lunia-btn lunia-btn-forest min-h-[44px] disabled:opacity-50">
            {pending ? "Recording…" : "Record payment"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SendDialog(props: Props & { onClose: () => void; onDone: (m: string) => void }) {
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">(props.hasPhone ? "whatsapp" : "email");
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [withLink, setWithLink] = useState(props.payConfigured && props.balanceMinor > 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await sendInvoiceAction(props.invoiceId, channel, withLink, locale);
      if (!res.ok) setError(res.error);
      else props.onDone(`Invoice sent${res.recipient ? ` to ${res.recipient}` : ""}.`);
    });
  }

  const channels = [
    { id: "whatsapp" as const, label: "WhatsApp", ok: props.hasPhone },
    { id: "sms" as const, label: "SMS", ok: props.hasPhone },
    { id: "email" as const, label: "Email", ok: props.hasEmail },
  ];

  return (
    <Modal title="Send to customer" onClose={props.onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!c.ok}
              onClick={() => setChannel(c.id)}
              className={`min-h-[44px] rounded-[var(--radius-sm)] border px-3 text-sm disabled:opacity-40 ${
                channel === c.id ? "border-[var(--color-forest)] bg-[var(--color-forest)] text-[var(--color-cream)]" : "border-[var(--line-strong)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className={labelCls}>
          Language
          <select value={locale} onChange={(e) => setLocale(e.target.value as "ar" | "en")} className={inputCls}>
            <option value="ar">Arabic</option>
            <option value="en">English</option>
          </select>
        </label>
        {props.balanceMinor > 0 && (
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" checked={withLink} disabled={!props.payConfigured} onChange={(e) => setWithLink(e.target.checked)} className="h-5 w-5" />
            Include an online pay link for {formatAmount(props.balanceMinor)} SAR
            {!props.payConfigured && <span className="text-xs text-[var(--color-ink)]/50">(no gateway configured)</span>}
          </label>
        )}
        <p className="text-xs text-[var(--color-ink)]/55">Uses the Invoice message template (Communications → Templates). Without a messaging provider it is logged only.</p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className="lunia-btn lunia-btn-ghost min-h-[44px]">
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={submit} className="lunia-btn lunia-btn-forest min-h-[44px] disabled:opacity-50">
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CreditDialog(props: Props & { onClose: () => void; onDone: (m: string) => void }) {
  const [qty, setQty] = useState<Record<number, string>>(() =>
    Object.fromEntries(props.creditable.map((l) => [l.sortOrder, String(l.remainingQty)])),
  );
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [refund, setRefund] = useState(props.refundableMinor > 0);
  const [refundMethod, setRefundMethod] = useState<(typeof REFUND_METHODS)[number]>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = props.creditable
    .map((l) => ({ l, q: Number.parseInt(qty[l.sortOrder] ?? "0", 10) || 0 }))
    .filter(({ q }) => q > 0);
  // Estimate only (the server computes the exact amounts incl. the invoice discount share).
  const ratio = props.lineSumMinor > 0 ? props.totalMinor / props.lineSumMinor : 1;
  const estimate = Math.round(chosen.reduce((s, { l, q }) => s + (l.totalMinor * q) / l.qty, 0) * ratio);
  const refundDefault = Math.min(estimate, props.refundableMinor);
  const [refundAmount, setRefundAmount] = useState("");
  const refundMinor = refundAmount ? parseSarToMinor(refundAmount) : refundDefault;
  const hasProducts = chosen.some(({ l }) => l.isProduct);

  function submit() {
    setError(null);
    if (chosen.length === 0) return setError("Choose at least one item to credit.");
    if (chosen.some(({ l, q }) => q > l.remainingQty)) return setError("A quantity is more than what's left to credit.");
    if (reason.trim().length < 3) return setError("Give a short reason (printed on the credit note).");
    if (refund && (refundMinor === null || refundMinor <= 0)) return setError("Enter a valid refund amount.");
    startTransition(async () => {
      const res = await createCreditNoteAction({
        originalInvoiceId: props.invoiceId,
        lines: chosen.map(({ l, q }) => ({ sortOrder: l.sortOrder, qty: q })),
        reason,
        restock,
        refund: refund && refundMinor ? { method: refundMethod, amountMinor: refundMinor } : undefined,
      });
      if (!res.ok) setError(res.error);
      else props.onDone(`Credit note ${res.number} issued.`);
    });
  }

  return (
    <Modal title="Credit note" onClose={props.onClose} widthClass="max-w-2xl">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink)]/65">
          Issued invoices can&rsquo;t be edited. A credit note reverses all or part of it (and returns products to stock).
        </p>
        <ul className="flex flex-col divide-y divide-[var(--line)]">
          {props.creditable.map((l) => (
            <li key={l.sortOrder} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{l.description}</span>
                <span className="text-xs text-[var(--color-ink)]/50">
                  {l.remainingQty} of {l.qty} left to credit
                </span>
              </span>
              <input
                inputMode="numeric"
                aria-label={`Quantity to credit for ${l.description}`}
                disabled={l.remainingQty === 0}
                value={qty[l.sortOrder] ?? "0"}
                onChange={(e) => setQty((s) => ({ ...s, [l.sortOrder]: e.target.value }))}
                className="lunia-input min-h-[44px] w-20 text-center tabular-nums"
              />
            </li>
          ))}
        </ul>
        <p className="text-sm">
          Credit amount ≈ <span className="font-medium tabular-nums">{formatAmount(estimate)} SAR</span>
        </p>
        <label className={labelCls}>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Product returned unopened" className={inputCls} />
        </label>
        {hasProducts && (
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-5 w-5" />
            Return credited products to stock
          </label>
        )}
        {props.refundableMinor > 0 && (
          <div className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] p-3">
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} className="h-5 w-5" />
              Refund the customer now (up to {formatAmount(props.refundableMinor)} SAR paid)
            </label>
            {refund && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  Refund method
                  <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as (typeof REFUND_METHODS)[number])} className={inputCls}>
                    {REFUND_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Refund amount (SAR)
                  <input inputMode="decimal" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder={toInput(refundDefault)} className={`${inputCls} tabular-nums`} />
                </label>
              </div>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className="lunia-btn lunia-btn-ghost min-h-[44px]">
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={submit} className="lunia-btn lunia-btn-danger min-h-[44px] disabled:opacity-50">
            {pending ? "Issuing…" : "Issue credit note"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
