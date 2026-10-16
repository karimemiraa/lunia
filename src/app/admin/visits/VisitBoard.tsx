"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Board, BoardCard, BoardColumn } from "@/modules/booking/journey";
import { useStaffT } from "../_i18n/StaffI18n";
import { intlLocale, type StaffLocale } from "../_i18n/t";
import { toast } from "../_components/toast";
import { DiscountControl } from "./DiscountControl";
import {
  availableSpecialistsAction, checkInVisitAction, checkOutAction, finishTreatmentAction, hospitalityAction,
  overridePaymentAction, reassignAction, receiveAction, roomReadyAction, startTreatmentAction, type JourneyActionResult,
} from "./actions";

const COLUMNS: { key: BoardColumn; title: string; hint: string }[] = [
  { key: "EXPECTED", title: "Expected today", hint: "Booked today, not here yet" },
  { key: "WAITING", title: "Waiting", hint: "Checked in, waiting to be received" },
  { key: "CONSULTATION", title: "Consultation", hint: "With the specialist before treatment" },
  { key: "TREATMENT", title: "In treatment", hint: "In the treatment room" },
  { key: "CHECKOUT", title: "Checkout", hint: "Paying and booking the next visit" },
  { key: "DONE", title: "Left today", hint: "Visit finished" },
];

const REFRESH_MS = 15_000;

function useNow(stepMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);
  return now;
}

const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

interface Props {
  board: Board;
  locale: StaffLocale;
  viewerId: string;
  canManage: boolean;
  canBill: boolean;
  canClinical: boolean;
  /** discount:give — her own visits, up to the cap. */
  canGiveDiscount?: boolean;
  /** discount:approve — any visit, and decides requests above the cap. */
  canApproveDiscount?: boolean;
  /** Reason presets (English source; shown translated). */
  discountReasons?: readonly string[];
  prayer: { next: { prayer: string; at: string }; today: { prayer: string; at: string }[] } | null;
}

export function VisitBoard({ board, locale, viewerId, canManage, canBill, canClinical, canGiveDiscount = false, canApproveDiscount = false, discountReasons = [], prayer }: Props) {
  const t = useStaffT();
  const router = useRouter();
  const now = useNow();
  const timeFmt = new Intl.DateTimeFormat(intlLocale(locale, "en-GB"), { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });

  // Live: re-read the board every few seconds (another desk may have moved someone).
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const byColumn = (key: BoardColumn) => board.cards.filter((c) => c.column === key);
  const waiting = byColumn("WAITING");
  const longestWait = waiting.reduce((m, c) => Math.max(m, minutesSince(c.since, now)), 0);
  const nextHour = byColumn("EXPECTED").filter((c) => new Date(c.startAt).getTime() - now < 3_600_000).length;
  const name = (en: string, ar: string | null) => (locale === "ar" && ar) || en;

  return (
    <div className="flex flex-col gap-5" data-testid="visit-board">
      {/* Right now */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Waiting now")} value={waiting.length} hint={waiting.length ? t("Longest: {n} min", { n: longestWait }) : t("No one waiting")} tone={longestWait >= board.settings.waitRedMin ? "danger" : longestWait >= board.settings.waitAmberMin ? "warning" : undefined} />
        <Stat label={t("With a specialist")} value={byColumn("CONSULTATION").length + byColumn("TREATMENT").length} hint={t("Consultation or treatment")} />
        <Stat label={t("At checkout")} value={byColumn("CHECKOUT").length} hint={t("Paying or booking next visit")} />
        <Stat label={t("Arriving within the hour")} value={nextHour} hint={t("Left today: {n}", { n: byColumn("DONE").length })} />
      </div>

      {/* Rooms + prayer */}
      <div className="flex flex-wrap items-center gap-2" data-testid="room-status">
        {board.rooms.map((r) => (
          <RoomChip key={r.id} room={r} label={name(r.name, r.nameAr)} timeFmt={timeFmt} now={now} prepareMin={board.settings.roomPrepareMin} />
        ))}
        {prayer && <PrayerChip next={prayer.next} today={prayer.today} timeFmt={timeFmt} now={now} />}
      </div>

      {/* The journey, left to right in reading order (mirrors in Arabic) */}
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {COLUMNS.map((col) => {
          const cards = byColumn(col.key);
          return (
            <section key={col.key} className="flex w-[17rem] shrink-0 snap-start flex-col gap-2" data-testid={`visit-column-${col.key}`} aria-label={t(col.title)}>
              <header className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                  {t(col.title)} <span className="ms-1 tabular-nums text-[var(--color-ink)]/45">{cards.length}</span>
                </h2>
              </header>
              <p className="px-1 text-xs text-[var(--color-ink)]/50">{t(col.hint)}</p>
              {cards.length === 0 && <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-3 py-6 text-center text-xs text-[var(--color-ink)]/45">{t("No one here")}</p>}
              {cards.map((c) => (
                <VisitCard key={c.bookingId} card={c} board={board} now={now} timeFmt={timeFmt} name={name} viewerId={viewerId} canManage={canManage} canBill={canBill} canClinical={canClinical} canGiveDiscount={canGiveDiscount} canApproveDiscount={canApproveDiscount} discountReasons={discountReasons} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: "warning" | "danger" }) {
  const color = tone === "danger" ? "text-[var(--status-danger-ink)]" : tone === "warning" ? "text-[var(--status-warning-ink)]" : "text-[var(--color-ink)]";
  return (
    <div className="lunia-card p-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/55">{label}</p>
      <p className={`mt-1 font-[family-name:var(--font-display)] text-3xl tabular-nums ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-[var(--color-ink)]/55">{hint}</p>
    </div>
  );
}

function RoomChip({ room, label, timeFmt, now, prepareMin }: { room: Board["rooms"][number]; label: string; timeFmt: Intl.DateTimeFormat; now: number; prepareMin: number }) {
  const t = useStaffT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const tone = room.state === "free" ? "bg-[var(--status-success-bg)] text-[var(--status-success-ink)]" : room.state === "preparing" ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-ink)]" : "bg-[var(--status-info-bg)] text-[var(--status-info-ink)]";
  const detail =
    room.state === "free" ? t("Free") :
    room.state === "occupied" ? t("Busy until {time}", { time: timeFmt.format(new Date(room.until!)) }) :
    t("Being prepared · {n} min left", { n: Math.max(0, prepareMin - minutesSince(room.since!, now)) });
  return (
    <span className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-medium ${tone}`} data-testid="room-chip" data-room-state={room.state}>
      <span>{label}</span>
      <span className="opacity-80">· {detail}</span>
      {room.state === "preparing" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { const r = await roomReadyAction(room.id); if (r.ok) router.refresh(); })}
          className="rounded-full bg-white/60 px-2 py-0.5 text-[0.7rem] font-semibold hover:bg-white disabled:opacity-60"
        >
          {t("Ready")}
        </button>
      )}
    </span>
  );
}

const PRAYER_LABEL: Record<string, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

function PrayerChip({ next, today, timeFmt, now }: { next: { prayer: string; at: string }; today: { prayer: string; at: string }[]; timeFmt: Intl.DateTimeFormat; now: number }) {
  const t = useStaffT();
  const inMin = Math.max(0, Math.ceil((new Date(next.at).getTime() - now) / 60_000));
  const soon = inMin <= 20;
  return (
    <span
      className={`ms-auto inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-medium ${soon ? "bg-[var(--status-accent-bg)] text-[var(--status-accent-ink)]" : "bg-[var(--color-ink)]/5 text-[var(--color-ink)]/70"}`}
      title={today.map((p) => `${t(PRAYER_LABEL[p.prayer]!)} ${timeFmt.format(new Date(p.at))}`).join(" · ")}
      data-testid="prayer-chip"
    >
      {inMin < 60
        ? t("{prayer} prayer in {n} min", { prayer: t(PRAYER_LABEL[next.prayer]!), n: inMin })
        : t("{prayer} prayer at {time}", { prayer: t(PRAYER_LABEL[next.prayer]!), time: timeFmt.format(new Date(next.at)) })}
    </span>
  );
}

function VisitCard({ card: c, board, now, timeFmt, name, viewerId, canManage, canBill, canClinical, canGiveDiscount, canApproveDiscount, discountReasons }: {
  card: BoardCard; board: Board; now: number; timeFmt: Intl.DateTimeFormat; name: (en: string, ar: string | null) => string;
  viewerId: string; canManage: boolean; canBill: boolean; canClinical: boolean;
  canGiveDiscount: boolean; canApproveDiscount: boolean; discountReasons: readonly string[];
}) {
  const t = useStaffT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [handOff, setHandOff] = useState<{ id: string; name: string }[] | null>(null);
  const mine = c.staffUserId === viewerId;
  const canMove = canManage || mine;
  const s = board.settings;

  const act = (fn: () => Promise<JourneyActionResult>, done?: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (done) toast({ title: done, tone: "success" });
        router.refresh();
      } else toast({ title: t("Could not update the visit"), body: r.error, tone: "error" });
    });

  // The live timer for the stage she's in.
  const stageMin = minutesSince(c.since, now);
  let timer: { text: string; tone: "ok" | "warn" | "bad" } | null = null;
  if (c.column === "EXPECTED") {
    const late = Math.floor((now - new Date(c.startAt).getTime()) / 60_000);
    timer = late > 5 ? { text: t("Late by {n} min", { n: late }), tone: late > 15 ? "bad" : "warn" } : { text: t("Due at {time}", { time: timeFmt.format(new Date(c.startAt)) }), tone: "ok" };
  } else if (c.column === "WAITING") {
    timer = { text: t("Waiting {n} min", { n: stageMin }), tone: stageMin >= s.waitRedMin ? "bad" : stageMin >= s.waitAmberMin ? "warn" : "ok" };
  } else if (c.column === "CONSULTATION") {
    timer = { text: t("Consultation {n} min", { n: stageMin }), tone: "ok" };
  } else if (c.column === "TREATMENT") {
    timer = { text: t("{n} of {planned} min", { n: stageMin, planned: c.durationMin }), tone: stageMin > c.durationMin + 5 ? "bad" : stageMin > c.durationMin ? "warn" : "ok" };
  } else if (c.column === "CHECKOUT") {
    timer = { text: t("At the desk {n} min", { n: stageMin }), tone: stageMin >= s.checkoutAmberMin ? "warn" : "ok" };
  } else if (c.column === "DONE" && c.arrivedAt && c.checkedOutAt) {
    timer = { text: t("Visit took {n} min", { n: Math.round((new Date(c.checkedOutAt).getTime() - new Date(c.arrivedAt).getTime()) / 60_000) }), tone: "ok" };
  }
  const timerTone = timer?.tone === "bad" ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-ink)]" : timer?.tone === "warn" ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-ink)]" : "bg-[var(--color-ink)]/5 text-[var(--color-ink)]/70";

  const unpaidGate = c.payment.required && !c.payment.paid && !c.payment.overridden;
  const flag = (text: string, tone: "warn" | "info" | "ok" = "info") => (
    <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${tone === "warn" ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-ink)]" : tone === "ok" ? "bg-[var(--status-success-bg)] text-[var(--status-success-ink)]" : "bg-[var(--status-info-bg)] text-[var(--status-info-ink)]"}`}>{text}</span>
  );
  const primary = "lunia-btn lunia-btn-forest lunia-btn-sm min-h-11 disabled:opacity-60";
  const ghost = "lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 disabled:opacity-60";
  const bookNext = `/admin/calendar?add=1&name=${encodeURIComponent(c.clientName)}${c.phone ? `&phone=${encodeURIComponent(c.phone)}` : ""}`;

  return (
    <article className="lunia-card flex flex-col gap-2 p-3" data-testid="visit-card" data-booking-id={c.bookingId} data-column={c.column} aria-busy={pending || undefined}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/admin/clients/${c.clientProfileId}`} className="font-medium leading-tight text-[var(--color-ink)] hover:underline">
          {t(c.clientName)}
        </Link>
        {timer && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums ${timerTone}`} data-testid="visit-timer" data-tone={timer.tone}>{timer.text}</span>}
      </div>
      <p className="text-xs leading-relaxed text-[var(--color-ink)]/65">
        {name(c.serviceName, c.serviceNameAr)} · {timeFmt.format(new Date(c.startAt))}
        <br />
        {name(c.staffName, c.staffNameAr)} · {name(c.roomName, c.roomNameAr)}
        {c.receivedByName && c.column !== "WAITING" && c.column !== "EXPECTED" && <> · {t("received by {name}", { name: c.receivedByName })}</>}
      </p>
      <div className="flex flex-wrap gap-1">
        {c.firstVisit && flag(t("First visit"))}
        {(c.column === "EXPECTED" || c.column === "WAITING") && c.needsConsultation && flag(t("Consultation first"))}
        {c.payment.required && flag(c.payment.paid ? t("Paid") : c.payment.overridden ? t("Let in unpaid") : t("Pay before treatment"), c.payment.paid ? "ok" : "warn")}
        {c.consentMissing > 0 && c.column !== "DONE" && flag(t("Consent to sign: {n}", { n: c.consentMissing }), "warn")}
        {c.healthProfileMissing && c.column !== "DONE" && flag(t("No health profile"), "warn")}
        {c.column === "WAITING" && c.hospitality && flag(t("Coffee served"), "ok")}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {c.column === "EXPECTED" && canManage && (
          <button type="button" className={primary} disabled={pending} onClick={() => act(() => checkInVisitAction(c.bookingId), t("{name} checked in", { name: t(c.clientName) }))}>
            {t("Check in")}
          </button>
        )}
        {c.column === "WAITING" && (
          <>
            {canMove && (
              <button
                type="button"
                className={primary}
                disabled={pending || (unpaidGate && !c.needsConsultation)}
                title={unpaidGate && !c.needsConsultation ? t("Take the payment first, or let her in without payment.") : undefined}
                onClick={() => act(() => receiveAction(c.bookingId), t("You have {name}", { name: t(c.clientName) }))}
              >
                {c.needsConsultation ? t("Receive for consultation") : t("Receive")}
              </button>
            )}
            {canManage && !c.hospitality && <button type="button" className={ghost} disabled={pending} onClick={() => act(() => hospitalityAction(c.bookingId))}>{t("Coffee served")}</button>}
            {canManage && handOff === null && (
              <button type="button" className={ghost} disabled={pending} onClick={() => start(async () => setHandOff(await availableSpecialistsAction(c.bookingId)))}>
                {t("Hand to…")}
              </button>
            )}
            {handOff !== null && (
              handOff.length === 0 ? (
                <span className="text-xs text-[var(--color-ink)]/55">{t("No other specialist is free right now.")}</span>
              ) : (
                <select
                  className="lunia-input min-h-11 py-1 text-sm"
                  aria-label={t("Hand to another specialist")}
                  defaultValue=""
                  onChange={(e) => e.target.value && act(() => reassignAction(c.bookingId, e.target.value), t("Handed over"))}
                >
                  <option value="" disabled>{t("Choose a specialist")}</option>
                  {handOff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )
            )}
          </>
        )}
        {c.column === "CONSULTATION" && canMove && (
          <button type="button" className={primary} disabled={pending || unpaidGate} title={unpaidGate ? t("Take the payment first, or let her in without payment.") : undefined} onClick={() => act(() => startTreatmentAction(c.bookingId))}>
            {t("To the treatment room")}
          </button>
        )}
        {c.column === "TREATMENT" && canMove && (
          <button type="button" className={primary} disabled={pending} onClick={() => act(() => finishTreatmentAction(c.bookingId), t("Sent to checkout"))}>
            {t("Finish treatment")}
          </button>
        )}
        {(c.column === "TREATMENT" || c.column === "CHECKOUT") && canClinical && mine && (
          <Link href={`/admin/clients/${c.clientProfileId}/clinical/treatment`} className={ghost}>{t("Treatment record")}</Link>
        )}
        {c.column === "CHECKOUT" && (
          <>
            {canBill && !c.payment.paid && <Link href={`/admin/billing/new?booking=${c.bookingId}`} className={primary}>{t("Take payment")}</Link>}
            {canManage && <Link href={bookNext} className={ghost}>{t("Book next visit")}</Link>}
            {canManage && (
              <button type="button" className={c.payment.paid || !canBill ? primary : ghost} disabled={pending} onClick={() => act(() => checkOutAction(c.bookingId), t("{name} checked out", { name: t(c.clientName) }))}>
                {t("Check out")}
              </button>
            )}
          </>
        )}
        {unpaidGate && (c.column === "WAITING" || c.column === "CONSULTATION") && (
          <>
            {canBill && <Link href={`/admin/billing/new?booking=${c.bookingId}`} className={ghost}>{t("Take payment")}</Link>}
            {canManage && (
              <button
                type="button"
                className={ghost}
                disabled={pending}
                onClick={() => {
                  const note = window.prompt(t("Why is she going in before paying? (saved on the visit)")) ?? "";
                  if (note.trim()) act(() => overridePaymentAction(c.bookingId, note));
                }}
              >
                {t("Let in without payment")}
              </button>
            )}
          </>
        )}
      </div>
      {(c.column === "CONSULTATION" || c.column === "TREATMENT" || c.column === "CHECKOUT") && (
        <DiscountControl card={c} mine={mine} canGive={canGiveDiscount} canApprove={canApproveDiscount} reasons={discountReasons} />
      )}
    </article>
  );
}
