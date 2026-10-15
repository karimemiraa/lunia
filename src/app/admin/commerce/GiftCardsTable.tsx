"use client";

import { useActionState, useMemo } from "react";
import type { GiftCardStatus } from "@prisma/client";
import { voidGiftCardAction, type CommerceActionState } from "./actions";
import { ConfirmButton } from "../_ui/ConfirmDialog";
import { DataTable, type Column } from "../_ui/DataTable";
import { StatusPill } from "../_ui/StatusPill";
import { formatSar } from "../_ui/money";
import { formatDate } from "../_ui/dates";
import { InlineStatus } from "../_ui/Form";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";
import type { StaffLocale, T } from "../_i18n/t";

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
  const t = useStaffT();
  const locale = useStaffLocale();
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="giftCardId" value={card.id} />
      <ConfirmButton title={t("Void this gift card?")} description={t("{code} still holds {amount}. Voiding cannot be undone.", { code: card.code, amount: formatSar(card.balanceMinor) })} confirmLabel={t("Void gift card")} pending={pending}>
        {/* "Void" is a status word in the shared dictionary; the button reads «إلغاء البطاقة» in Arabic. */}
        {locale === "ar" ? t("Void gift card") : "Void"}
      </ConfirmButton>
      <InlineStatus size="sm" error={state.error} />
    </form>
  );
}

const buildColumns = (t: T, locale: StaffLocale): Column<GiftCardRowDTO>[] => [
  { key: "code", header: t("Code"), render: (c) => <span dir="ltr" className="font-mono">{c.code}</span> },
  { key: "balanceMinor", header: t("Balance"), numeric: true, render: (c) => formatSar(c.balanceMinor) },
  { key: "initialMinor", header: t("Initial"), numeric: true, render: (c) => formatSar(c.initialMinor) },
  { key: "issuedToClientName", header: t("Customer"), render: (c) => c.issuedToClientName ?? <span className="text-[var(--color-ink)]/45">{t("None")}</span> },
  { key: "status", header: t("Status"), render: (c) => <StatusPill status={c.status} /> },
  { key: "redemptionCount", header: t("Redemptions"), numeric: true },
  { key: "expiresAtIso", header: t("Expires"), value: (c) => c.expiresAtIso, render: (c) => (c.expiresAtIso ? formatDate(c.expiresAtIso, locale) : t("None")) },
  { key: "createdAtIso", header: locale === "ar" ? t("Issue date") : "Issued", value: (c) => c.createdAtIso, render: (c) => formatDate(c.createdAtIso, locale) },
  { key: "__actions", header: <span className="sr-only">{t("Actions")}</span>, sortable: false, align: "end", render: (c) => (c.status === "ACTIVE" ? <VoidButton card={c} /> : null) },
];

export function GiftCardsTable({ cards }: { cards: GiftCardRowDTO[] }) {
  const t = useStaffT();
  const locale = useStaffLocale();
  const columns = useMemo(() => buildColumns(t, locale), [t, locale]);
  return (
    <DataTable
      columns={columns}
      rows={cards}
      rowKey={(c) => c.id}
      search={(c) => `${c.code} ${c.issuedToClientName ?? ""}`}
      searchPlaceholder={t("Search by code or customer…")}
      initialSort={{ key: "createdAtIso", dir: "desc" }}
      exportCsv="gift-cards"
      empty={{ title: t("No gift cards issued yet"), description: t("Issue a gift card above; the customer can redeem it at checkout.") }}
      ariaLabel={t("Gift cards")}
    />
  );
}
