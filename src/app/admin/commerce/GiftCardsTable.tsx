"use client";

import { useActionState } from "react";
import type { GiftCardStatus } from "@prisma/client";
import { voidGiftCardAction, type CommerceActionState } from "./actions";
import { ConfirmButton } from "../_ui/ConfirmDialog";
import { DataTable, type Column } from "../_ui/DataTable";
import { StatusPill } from "../_ui/StatusPill";
import { formatSar } from "../_ui/money";
import { formatDate } from "../_ui/dates";

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

function VoidButton({ card }: { card: GiftCardRowDTO }) {
  const [state, action, pending] = useActionState(voidGiftCardAction, initialState);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="giftCardId" value={card.id} />
      <ConfirmButton title="Void this gift card?" description={`${card.code} still holds ${formatSar(card.balanceMinor)}. Voiding cannot be undone.`} confirmLabel="Void gift card" pending={pending}>
        Void
      </ConfirmButton>
      {state.error && (
        <p role="alert" className="text-xs text-[var(--status-danger-ink)]">
          {state.error}
        </p>
      )}
    </form>
  );
}

const columns: Column<GiftCardRowDTO>[] = [
  { key: "code", header: "Code", render: (c) => <span className="font-mono">{c.code}</span> },
  { key: "balanceMinor", header: "Balance", numeric: true, render: (c) => formatSar(c.balanceMinor) },
  { key: "initialMinor", header: "Initial", numeric: true, render: (c) => formatSar(c.initialMinor) },
  { key: "issuedToClientName", header: "Customer", render: (c) => c.issuedToClientName ?? <span className="text-[var(--color-ink)]/45">None</span> },
  { key: "status", header: "Status", render: (c) => <StatusPill status={c.status} /> },
  { key: "redemptionCount", header: "Redemptions", numeric: true },
  { key: "expiresAtIso", header: "Expires", value: (c) => c.expiresAtIso, render: (c) => (c.expiresAtIso ? formatDate(c.expiresAtIso) : "None") },
  { key: "createdAtIso", header: "Issued", value: (c) => c.createdAtIso, render: (c) => formatDate(c.createdAtIso) },
  { key: "__actions", header: <span className="sr-only">Actions</span>, sortable: false, align: "end", render: (c) => (c.status === "ACTIVE" ? <VoidButton card={c} /> : null) },
];

export function GiftCardsTable({ cards }: { cards: GiftCardRowDTO[] }) {
  return (
    <DataTable
      columns={columns}
      rows={cards}
      rowKey={(c) => c.id}
      search={(c) => `${c.code} ${c.issuedToClientName ?? ""}`}
      searchPlaceholder="Search by code or customer…"
      initialSort={{ key: "createdAtIso", dir: "desc" }}
      exportCsv="gift-cards"
      empty={{ title: "No gift cards issued yet", description: "Issue a gift card above; the customer can redeem it at checkout." }}
      ariaLabel="Gift cards"
    />
  );
}
