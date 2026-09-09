"use client";

import { useActionState } from "react";
import { voidGiftCardAction, type CommerceActionState } from "./actions";
import type { GiftCardStatus } from "@prisma/client";

export interface GiftCardRowDTO {
  id: string;
  code: string;
  balanceMinor: number;
  initialMinor: number;
  currency: string;
  status: GiftCardStatus;
  issuedToClientName: string | null;
  expiresAtIso: string | null;
  redemptionCount: number;
  createdAtIso: string;
}

const initialState: CommerceActionState = {};

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
}

const STATUS_STYLES: Record<GiftCardStatus, string> = {
  ACTIVE: "bg-[var(--color-teal)]/15 text-[var(--color-teal)]",
  REDEEMED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60",
  VOID: "bg-red-100 text-red-700",
};

function VoidButton({ giftCardId }: { giftCardId: string }) {
  const [state, action, pending] = useActionState(voidGiftCardAction, initialState);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm("Void this gift card? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
      className="flex flex-col items-start gap-1"
    >
      <input type="hidden" name="giftCardId" value={giftCardId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-red-600/30 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "Voiding…" : "Void"}
      </button>
      {state.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function GiftCardsTable({ cards }: { cards: GiftCardRowDTO[] }) {
  if (cards.length === 0) {
    return <p className="text-sm text-[var(--color-ink)]/60">No gift cards issued yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
      <table className="w-full text-left text-sm" data-testid="giftcards-table">
        <thead className="bg-[var(--color-cream)]/60">
          <tr>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Code</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Balance / Initial</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Client</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Status</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Redemptions</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Expires</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Issued</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Action</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <tr key={card.id} className="border-t border-[var(--color-ink)]/10" data-testid="giftcard-row">
              <td className="whitespace-nowrap px-4 py-2 font-mono text-[var(--color-ink)]">{card.code}</td>
              <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]">
                {formatMinor(card.balanceMinor, card.currency)} / {formatMinor(card.initialMinor, card.currency)}
              </td>
              <td className="px-4 py-2 text-[var(--color-ink)]">{card.issuedToClientName ?? "—"}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[card.status]}`}>
                  {card.status}
                </span>
              </td>
              <td className="px-4 py-2 text-[var(--color-ink)]">{card.redemptionCount}</td>
              <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]/70">
                {card.expiresAtIso ? formatDate(card.expiresAtIso) : "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]/70">{formatDate(card.createdAtIso)}</td>
              <td className="px-4 py-2">{card.status === "ACTIVE" ? <VoidButton giftCardId={card.id} /> : <span className="text-xs text-[var(--color-ink)]/30">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
