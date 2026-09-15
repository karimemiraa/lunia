"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { trackEvent } from "@/components/analytics/Tracker";
import {
  getSlots,
  startOtp,
  verifyAndBook,
  getMyActivePackages,
  applyPackageToBookingAction,
  joinWaitlistAction,
  type SlotDTO,
  type BookingSummaryDTO,
  type MyPackageOptionDTO,
} from "./actions";

export interface BookableServiceDTO {
  id: string;
  name: string;
  departmentName: string;
  durationMin: number;
  priceMinor: number;
  /** Membership tier name required to book this service, or null if open to all. */
  tierNote: string | null;
}

interface BookingWizardProps {
  services: BookableServiceDTO[];
  locale: "en" | "ar";
  sourceChannel: string;
  /** One-tap rebooking deep-link (account page's "Book again"): pre-selects this service and jumps to step 2. */
  prefillServiceId?: string | null;
  /** Preferred staff for the deep-link above; matched against the first available slot when possible, otherwise ignored. */
  prefillStaffUserId?: string | null;
}

type Step = 1 | 2 | 3 | 4;
const TOTAL_STEPS = 4;

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST) — see availability.ts. */
const CENTER_TZ = "Asia/Riyadh";

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

const inputClass = `w-full rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-page)] px-4 py-3 text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink)]/40 transition-colors focus:border-[var(--color-teal)] ${focusRingClass}`;

const labelClass = "text-sm font-medium text-[var(--color-ink)]";

const primaryButtonClass = `inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-teal)] px-8 py-3.5 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:bg-[var(--color-canopy)] disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`;

const secondaryButtonClass = `inline-flex items-center justify-center whitespace-nowrap rounded-full border border-[var(--color-ink)]/20 px-6 py-2.5 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/5 disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`;

function toCenterDateISO(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CENTER_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );
}

function formatDayLabel(dateISO: string, locale: string): { weekday: string; day: string } {
  const atNoonUtc = new Date(`${dateISO}T12:00:00Z`);
  const intlLocale = locale === "ar" ? "ar-SA" : "en-US";
  const weekday = new Intl.DateTimeFormat(intlLocale, { timeZone: CENTER_TZ, weekday: "short" }).format(atNoonUtc);
  const day = new Intl.DateTimeFormat(intlLocale, { timeZone: CENTER_TZ, day: "numeric", month: "short" }).format(
    atNoonUtc,
  );
  return { weekday, day };
}

function formatTime(iso: string, locale: string): string {
  const intlLocale = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, { timeZone: CENTER_TZ, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

function formatDate(iso: string, locale: string): string {
  const intlLocale = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone: CENTER_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

function formatSar(priceMinor: number, locale: string): string {
  const intlLocale = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(priceMinor / 100);
}

// The four-step public booking wizard: pick a service, pick a date/time,
// verify a phone by OTP, then confirm. All persistence goes through the
// server actions in ./actions.ts (getSlots / startOtp / verifyAndBook) —
// this component only holds UI/selection state and never talks to the DB
// directly.
export function BookingWizard({
  services,
  locale,
  sourceChannel,
  prefillServiceId = null,
  prefillStaffUserId = null,
}: BookingWizardProps) {
  const t = useTranslations("book");
  const [isPending, startTransition] = useTransition();

  // One-tap rebooking (account page's "Book again"): a valid prefillServiceId
  // (validated against the actual services list) seeds step/selectedServiceId
  // directly via lazy initial state, rather than an effect that would call
  // setState synchronously on mount -- only the async "find the next
  // available slot for it" part below needs an effect.
  const initialServiceId =
    prefillServiceId && services.some((service) => service.id === prefillServiceId) ? prefillServiceId : null;

  const [step, setStep] = useState<Step>(initialServiceId ? 2 : 1);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(initialServiceId);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotDTO[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotDTO | null>(null);

  const [name, setName] = useState("");
  // Either a phone number or an email address — resolved server-side (see
  // ./actions.ts's startOtp/verifyAndBook, which pass this raw value
  // straight to requestOtp/verifyOtp for classification).
  const [identifier, setIdentifier] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);
  // Optional gift-card code, entered alongside the OTP code -- applied
  // best-effort by verifyAndBook (a bad/unknown/expired code never blocks
  // the booking itself; see ./actions.ts's applyGiftCardBestEffort).
  const [giftCardCode, setGiftCardCode] = useState("");

  const [summary, setSummary] = useState<BookingSummaryDTO | null>(null);

  // "Join the waitlist" affordance, offered on the date/time step once a
  // chosen day comes back with no bookable slot for the selected service.
  // Deliberately its own name/identifier fields (rather than reusing the
  // step-3 contact fields above) since it can be submitted before the
  // client ever reaches step 3.
  const [waitlistName, setWaitlistName] = useState("");
  const [waitlistIdentifier, setWaitlistIdentifier] = useState("");
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [waitlistPending, startWaitlistTransition] = useTransition();

  // Post-booking "apply a package" widget on the success step (step 4) --
  // only ever shows the now-authenticated client's own packages (see
  // getMyActivePackages's privacy rationale in ./actions.ts).
  const [myPackages, setMyPackages] = useState<MyPackageOptionDTO[] | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [packageApplyState, setPackageApplyState] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const [packageApplyError, setPackageApplyError] = useState<string | null>(null);

  const nameId = useId();
  const identifierId = useId();
  const codeId = useId();
  const dateId = useId();
  const giftCardId = useId();
  const packageSelectId = useId();
  const waitlistNameId = useId();
  const waitlistIdentifierId = useId();

  // Funnel analytics: privacy-preserving, anonymous, and best-effort -- see
  // src/components/analytics/Tracker.tsx. Never blocks or throws.
  useEffect(() => {
    trackEvent("booking_started");
  }, []);

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );

  const groupedServices = useMemo(() => {
    const groups: { departmentName: string; services: BookableServiceDTO[] }[] = [];
    const indexByDept = new Map<string, number>();
    for (const service of services) {
      let index = indexByDept.get(service.departmentName);
      if (index === undefined) {
        index = groups.length;
        indexByDept.set(service.departmentName, index);
        groups.push({ departmentName: service.departmentName, services: [] });
      }
      groups[index]!.services.push(service);
    }
    return groups;
  }, [services]);

  const next14Days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 14 }, (_, i) => toCenterDateISO(new Date(now.getTime() + i * 86_400_000)));
  }, []);

  // One-tap rebooking (account page's "Book again"): when the page was
  // reached via /book?service=<slug>&staff=<staffUserId>, initialServiceId
  // above already seeded step 2 -- this effect does the async part, landing
  // on the next available slot for that service. It prefers the same staff
  // member when one of their slots is free on that day, otherwise falls
  // back to the first free slot on the first day that has one. Runs once on
  // mount; ordinary (non-deep-link) visits are unaffected since
  // initialServiceId is null.
  useEffect(() => {
    if (!initialServiceId) return;

    startTransition(async () => {
      for (const dateISO of next14Days) {
        const result = await getSlots(initialServiceId, dateISO, locale);
        if (!result.ok || result.slots.length === 0) continue;

        const preferred = prefillStaffUserId
          ? result.slots.find((slot) => slot.staffUserId === prefillStaffUserId)
          : undefined;

        setSelectedDate(dateISO);
        setSlots(result.slots);
        setSelectedSlot(preferred ?? result.slots[0]!);
        return;
      }
    });
    // Intentionally runs once on mount only -- initialServiceId/prefillStaffUserId
    // are deep-link inputs, not live selection state to keep re-syncing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetWaitlistState() {
    setWaitlistName("");
    setWaitlistIdentifier("");
    setWaitlistError(null);
    setWaitlistJoined(false);
  }

  function selectService(serviceId: string) {
    setSelectedServiceId(serviceId);
    setSelectedDate(null);
    setSlots(null);
    setSlotsError(null);
    setSelectedSlot(null);
    resetWaitlistState();
    setStep(2);
  }

  function selectDate(dateISO: string) {
    setSelectedDate(dateISO);
    setSelectedSlot(null);
    setSlots(null);
    setSlotsError(null);
    resetWaitlistState();
    if (!selectedServiceId) return;
    startTransition(async () => {
      const result = await getSlots(selectedServiceId, dateISO, locale);
      if (result.ok) {
        setSlots(result.slots);
      } else {
        setSlotsError(result.error);
      }
    });
  }

  function handleJoinWaitlist() {
    setWaitlistError(null);
    if (!waitlistName.trim() || !waitlistIdentifier.trim()) {
      setWaitlistError(t("errors.missingContact"));
      return;
    }
    if (!selectedServiceId || !selectedDate) return;
    startWaitlistTransition(async () => {
      const result = await joinWaitlistAction({
        serviceId: selectedServiceId,
        desiredDateISO: selectedDate,
        name: waitlistName,
        identifier: waitlistIdentifier,
        locale,
      });
      if (result.ok) {
        setWaitlistJoined(true);
      } else {
        setWaitlistError(result.error);
      }
    });
  }

  function goToContactStep() {
    if (!selectedSlot) return;
    setStep(3);
  }

  function handleSendCode() {
    setContactError(null);
    if (!name.trim() || !identifier.trim()) {
      setContactError(t("errors.missingContact"));
      return;
    }
    startTransition(async () => {
      const result = await startOtp(identifier, locale);
      if (result.ok) {
        setOtpSent(true);
        setDevCode(result.devCode ?? null);
      } else {
        setContactError(result.error);
      }
    });
  }

  function handleConfirmBooking() {
    setContactError(null);
    if (!selectedServiceId || !selectedSlot) {
      setContactError(t(!selectedServiceId ? "errors.noService" : "errors.noSlot"));
      return;
    }
    startTransition(async () => {
      const result = await verifyAndBook({
        serviceId: selectedServiceId,
        startAt: selectedSlot.startAt,
        name,
        identifier,
        code,
        locale,
        sourceChannel,
        giftCardCode: giftCardCode.trim() || undefined,
      });
      if (result.ok) {
        setSummary(result.booking);
        setStep(4);
        trackEvent("booking_completed", { serviceId: selectedServiceId });
        // Best-effort, non-blocking: the booking above already succeeded
        // regardless of whether this client happens to hold any packages.
        void getMyActivePackages().then(setMyPackages);
      } else {
        setContactError(result.error);
      }
    });
  }

  function handleApplyPackage() {
    if (!summary || !selectedPackageId) return;
    setPackageApplyState("applying");
    setPackageApplyError(null);
    startTransition(async () => {
      const result = await applyPackageToBookingAction(summary.bookingId, selectedPackageId, locale);
      if (result.ok) {
        setPackageApplyState("applied");
      } else {
        setPackageApplyState("error");
        setPackageApplyError(result.error);
      }
    });
  }

  function resetForAnotherBooking() {
    setStep(1);
    setSelectedServiceId(null);
    setSelectedDate(null);
    setSlots(null);
    setSlotsError(null);
    setSelectedSlot(null);
    setName("");
    setIdentifier("");
    setOtpSent(false);
    setDevCode(null);
    setCode("");
    setContactError(null);
    setGiftCardCode("");
    setSummary(null);
    setMyPackages(null);
    setSelectedPackageId("");
    setPackageApplyState("idle");
    setPackageApplyError(null);
    resetWaitlistState();
  }

  const stepLabels = [t("steps.service"), t("steps.datetime"), t("steps.contact"), t("steps.confirm")];

  return (
    <div className="flex flex-col gap-10" data-testid="booking-wizard">
      <ol
        aria-label={t("progressLabel", { step, total: TOTAL_STEPS })}
        className="flex items-center"
      >
        {stepLabels.map((label, index) => {
          const stepNumber = (index + 1) as Step;
          const isCurrent = stepNumber === step;
          const isDone = stepNumber < step;
          const isLast = index === stepLabels.length - 1;
          return (
            <li
              key={label}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex items-center ${isLast ? "" : "flex-1"}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isDone
                    ? "bg-[var(--color-teal)] text-[var(--color-ink)]"
                    : isCurrent
                      ? "bg-[var(--color-ink)] text-[var(--color-cream)] ring-2 ring-[var(--color-teal)] ring-offset-2 ring-offset-[var(--color-page)]"
                      : "border border-[var(--color-ink)]/25 text-[var(--color-ink)]/45"
                }`}
              >
                {isDone ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                  </svg>
                ) : (
                  stepNumber
                )}
              </span>
              <span
                className={`ms-2 hidden text-sm font-medium tracking-wide sm:inline ${
                  isCurrent || isDone ? "text-[var(--color-ink)]" : "text-[var(--color-ink)]/40"
                }`}
              >
                {label}
              </span>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`mx-3 h-0.5 flex-1 rounded-full transition-colors ${
                    isDone ? "bg-[var(--color-teal)]" : "bg-[var(--color-ink)]/12"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="flex flex-col gap-8" data-testid="booking-step-service">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
            {t("service.heading")}
          </h2>
          {services.length === 0 ? (
            <p className="text-sm text-[var(--color-ink)]/60">{t("service.emptyState")}</p>
          ) : (
            <div className="flex flex-col gap-10" role="group" aria-label={t("service.chooseLabel")}>
              {groupedServices.map((group) => (
                <div key={group.departmentName} className="flex flex-col gap-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-ink)]/40">
                    {group.departmentName}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {group.services.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => selectService(service.id)}
                        aria-pressed={selectedServiceId === service.id}
                        data-service-id={service.id}
                        className={`flex flex-col gap-2 rounded-2xl border p-5 text-start transition-colors ${
                          selectedServiceId === service.id
                            ? "border-[var(--color-teal)] bg-[var(--color-teal)]/10"
                            : "border-[var(--color-ink)]/10 hover:border-[var(--color-ink)]/25"
                        } ${focusRingClass}`}
                      >
                        <span className="text-base font-medium text-[var(--color-ink)]">{service.name}</span>
                        <span className="text-sm text-[var(--color-ink)]/65">
                          {t("service.durationValue", { minutes: service.durationMin })} · {formatSar(service.priceMinor, locale)}
                        </span>
                        {service.tierNote && (
                          <span className="text-xs font-medium text-[var(--color-gold)]">
                            {t("service.tierNote", { tier: service.tierNote })}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-8" data-testid="booking-step-datetime">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
              {t("date.heading")}
            </h2>
            <button type="button" onClick={() => setStep(1)} className={secondaryButtonClass}>
              {t("backLabel")}
            </button>
          </div>

          {selectedService && (
            <p className="text-sm text-[var(--color-ink)]/65">
              {selectedService.name} · {t("service.durationValue", { minutes: selectedService.durationMin })}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <span id={dateId} className={labelClass}>
              {t("date.dateLabel")}
            </span>
            <div role="group" aria-labelledby={dateId} className="flex gap-2 overflow-x-auto pb-2">
              {next14Days.map((dateISO) => {
                const { weekday, day } = formatDayLabel(dateISO, locale);
                const isSelected = selectedDate === dateISO;
                return (
                  <button
                    key={dateISO}
                    type="button"
                    data-date={dateISO}
                    aria-pressed={isSelected}
                    onClick={() => selectDate(dateISO)}
                    className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border px-4 py-3 transition-colors ${
                      isSelected
                        ? "border-[var(--color-teal)] bg-[var(--color-teal)]/10"
                        : "border-[var(--color-ink)]/10 hover:border-[var(--color-ink)]/25"
                    } ${focusRingClass}`}
                  >
                    <span className="text-xs uppercase tracking-wide text-[var(--color-ink)]/50">{weekday}</span>
                    <span className="text-sm font-medium text-[var(--color-ink)]">{day}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedDate && (
            <div className="flex flex-col gap-3">
              <span className={labelClass}>{t("date.timeHeading")}</span>
              {isPending && !slots && !slotsError && (
                <p className="text-sm text-[var(--color-ink)]/60">{t("date.loadingSlots")}</p>
              )}
              {slotsError && <p className="text-sm font-medium text-red-700">{slotsError}</p>}
              {slots && slots.length === 0 && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-[var(--color-ink)]/60">{t("date.noSlots")}</p>

                  <div
                    className="lunia-card lunia-animate-fade-in flex flex-col gap-4 p-5"
                    data-testid="booking-waitlist-form"
                  >
                    {waitlistJoined ? (
                      <p className="text-sm font-medium text-[var(--color-teal)]" data-testid="booking-waitlist-joined">
                        {t("waitlist.joinedMessage")}
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1">
                          <h3 className="text-base font-medium text-[var(--color-ink)]">{t("waitlist.heading")}</h3>
                          <p className="text-sm text-[var(--color-ink)]/65">{t("waitlist.intro")}</p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <label htmlFor={waitlistNameId} className={labelClass}>
                              {t("contact.nameLabel")}
                            </label>
                            <input
                              id={waitlistNameId}
                              type="text"
                              maxLength={200}
                              autoComplete="name"
                              value={waitlistName}
                              onChange={(e) => setWaitlistName(e.target.value)}
                              className={inputClass}
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label htmlFor={waitlistIdentifierId} className={labelClass}>
                              {t("contact.identifierLabel")}
                            </label>
                            <input
                              id={waitlistIdentifierId}
                              type="text"
                              inputMode="email"
                              maxLength={254}
                              value={waitlistIdentifier}
                              onChange={(e) => setWaitlistIdentifier(e.target.value)}
                              className={inputClass}
                            />
                          </div>
                        </div>

                        {waitlistError && (
                          <p role="alert" className="text-sm font-medium text-red-700">
                            {waitlistError}
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={handleJoinWaitlist}
                          disabled={waitlistPending}
                          className={`w-fit ${secondaryButtonClass}`}
                          data-testid="booking-waitlist-submit"
                        >
                          {waitlistPending ? t("waitlist.joiningLabel") : t("waitlist.joinLabel")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {slots && slots.length > 0 && (
                <div className="flex flex-wrap gap-2" data-testid="booking-slots">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.startAt === slot.startAt;
                    return (
                      <button
                        key={slot.startAt}
                        type="button"
                        data-slot-time={slot.startAt}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                          isSelected
                            ? "border-[var(--color-teal)] bg-[var(--color-teal)] text-[var(--color-ink)]"
                            : "border-[var(--color-ink)]/15 text-[var(--color-ink)] hover:border-[var(--color-ink)]/30"
                        } ${focusRingClass}`}
                      >
                        {formatTime(slot.startAt, locale)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={goToContactStep}
            disabled={!selectedSlot}
            className={`w-fit ${primaryButtonClass}`}
          >
            {t("date.continueLabel")}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-6" data-testid="booking-step-contact">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
              {t("contact.heading")}
            </h2>
            <button type="button" onClick={() => setStep(2)} className={secondaryButtonClass}>
              {t("backLabel")}
            </button>
          </div>

          {selectedService && selectedSlot && (
            <p className="text-sm text-[var(--color-ink)]/65">
              {selectedService.name} · {formatDate(selectedSlot.startAt, locale)} · {formatTime(selectedSlot.startAt, locale)}
            </p>
          )}

          <p className="text-sm leading-relaxed text-[var(--color-ink)]/65">{t("contact.intro")}</p>

          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className={labelClass}>
              {t("contact.nameLabel")}
            </label>
            <input
              id={nameId}
              type="text"
              required
              maxLength={200}
              autoComplete="name"
              value={name}
              disabled={otpSent}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={identifierId} className={labelClass}>
              {t("contact.identifierLabel")}
            </label>
            <input
              id={identifierId}
              type="text"
              inputMode="email"
              required
              maxLength={254}
              value={identifier}
              disabled={otpSent}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputClass}
            />
          </div>

          {!otpSent ? (
            <button type="button" onClick={handleSendCode} disabled={isPending} className={`w-fit ${primaryButtonClass}`}>
              {isPending ? t("contact.sendingLabel") : t("contact.sendCodeLabel")}
            </button>
          ) : (
            <>
              <p className="text-sm text-[var(--color-ink)]/65">{t("contact.codeIntro", { contact: identifier })}</p>
              {devCode && (
                <p data-testid="dev-otp-code" className="text-sm font-medium text-[var(--color-canopy)]">
                  {t("contact.devCodeHint", { code: devCode })}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <label htmlFor={codeId} className={labelClass}>
                  {t("contact.codeLabel")}
                </label>
                <input
                  id={codeId}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor={giftCardId} className={labelClass}>
                  {t("contact.giftCardLabel")}
                </label>
                <input
                  id={giftCardId}
                  type="text"
                  autoCapitalize="characters"
                  placeholder={t("contact.giftCardPlaceholder")}
                  value={giftCardCode}
                  onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                  className={inputClass}
                />
                <p className="text-xs text-[var(--color-ink)]/50">{t("contact.giftCardHint")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handleConfirmBooking}
                  disabled={isPending || code.length !== 6}
                  className={primaryButtonClass}
                >
                  {isPending ? t("contact.verifyingLabel") : t("contact.verifyLabel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setDevCode(null);
                    setCode("");
                    setContactError(null);
                  }}
                  className="text-sm font-medium text-[var(--color-ink)] underline decoration-[var(--color-gold)] decoration-2 underline-offset-4"
                >
                  {t("contact.changeContactLabel")}
                </button>
              </div>
            </>
          )}

          {contactError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {contactError}
            </p>
          )}
        </div>
      )}

      {step === 4 && summary && (
        <div className="flex flex-col gap-6" data-testid="booking-step-success">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
            {t("success.heading")}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-ink)]/70">{t("success.intro")}</p>

          <dl className="flex flex-col gap-3 rounded-2xl border border-[var(--color-ink)]/10 bg-[var(--color-page)] p-6 text-sm text-[var(--color-ink)]/80">
            {selectedService && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-ink)]/50">{t("success.serviceLabel")}</dt>
                <dd className="font-medium text-[var(--color-ink)]">{selectedService.name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-ink)]/50">{t("success.dateLabel")}</dt>
              <dd className="font-medium text-[var(--color-ink)]">{formatDate(summary.startAt, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-ink)]/50">{t("success.timeLabel")}</dt>
              <dd className="font-medium text-[var(--color-ink)]">{formatTime(summary.startAt, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-ink)]/50">{t("success.priceLabel")}</dt>
              <dd className="font-medium text-[var(--color-ink)]">{formatSar(summary.priceMinorSnapshot, locale)}</dd>
            </div>
            {summary.giftCardAppliedMinor !== undefined && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-ink)]/50">{t("success.giftCardAppliedLabel")}</dt>
                <dd className="font-medium text-[var(--color-teal)]">
                  {formatSar(summary.giftCardAppliedMinor, locale)}
                </dd>
              </div>
            )}
          </dl>

          {myPackages && myPackages.length > 0 && (
            <div
              className="flex flex-col gap-3 rounded-2xl border border-[var(--color-ink)]/10 bg-[var(--color-page)] p-6"
              data-testid="booking-apply-package"
            >
              <span className={labelClass}>{t("success.usePackageLabel")}</span>
              {packageApplyState === "applied" ? (
                <p className="text-sm font-medium text-[var(--color-teal)]">{t("success.packageAppliedLabel")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor={packageSelectId} className="sr-only">
                      {t("success.usePackageLabel")}
                    </label>
                    <select
                      id={packageSelectId}
                      value={selectedPackageId}
                      onChange={(e) => setSelectedPackageId(e.target.value)}
                      className={`${inputClass} w-auto min-w-[14rem]`}
                    >
                      <option value="">{t("success.selectPackagePlaceholder")}</option>
                      {myPackages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {(locale === "ar" ? pkg.nameAr : pkg.nameEn)}{" "}
                          {t("success.sessionsRemainingOption", { remaining: pkg.sessionsRemaining, total: pkg.sessionsTotal })}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleApplyPackage}
                      disabled={!selectedPackageId || packageApplyState === "applying"}
                      className={secondaryButtonClass}
                    >
                      {packageApplyState === "applying" ? t("success.applyingLabel") : t("success.applyPackageLabel")}
                    </button>
                  </div>
                  {packageApplyState === "error" && packageApplyError && (
                    <p role="alert" className="text-sm font-medium text-red-700">
                      {packageApplyError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <Link href={`/${locale}/account`} className={primaryButtonClass}>
              {t("success.accountLabel")}
            </Link>
            <button type="button" onClick={resetForAnotherBooking} className={secondaryButtonClass}>
              {t("success.bookAnotherLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
