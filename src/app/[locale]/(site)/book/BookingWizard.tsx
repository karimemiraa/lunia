"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { trackEvent } from "@/components/analytics/Tracker";
import { FieldError, isValidIdentifier } from "@/components/site/forms";
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

/** sessionStorage key for the in-progress selection (survives a reload, not a new tab). */
export const BOOKING_DRAFT_KEY = "lunia:booking-draft";
/** How many days past the chosen date to look for alternatives when a day is full. */
const LOOKAHEAD_DAYS = 6;

interface BookingDraft {
  step: Step;
  serviceId: string | null;
  dateISO: string | null;
  slot: SlotDTO | null;
  name: string;
  identifier: string;
}

function readDraft(): BookingDraft | null {
  try {
    const raw = window.sessionStorage.getItem(BOOKING_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<BookingDraft>;
    if (!d || typeof d !== "object") return null;
    return {
      step: d.step === 2 || d.step === 3 ? d.step : 1,
      serviceId: typeof d.serviceId === "string" ? d.serviceId : null,
      dateISO: typeof d.dateISO === "string" ? d.dateISO : null,
      slot: d.slot && typeof d.slot.startAt === "string" ? d.slot : null,
      name: typeof d.name === "string" ? d.name : "",
      identifier: typeof d.identifier === "string" ? d.identifier : "",
    };
  } catch {
    return null;
  }
}

function writeDraft(draft: BookingDraft | null) {
  try {
    if (!draft) window.sessionStorage.removeItem(BOOKING_DRAFT_KEY);
    else window.sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode / quota): the wizard still works, it just won't survive a reload.
  }
}

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

function formatShortDate(dateISO: string, locale: string): string {
  const { weekday, day } = formatDayLabel(dateISO, locale);
  return `${weekday} ${day}`;
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
// directly. The in-progress selection is mirrored to sessionStorage so a
// reload (or an accidental back-swipe) doesn't lose it.
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
  // Alternatives offered when a day has nothing free: the next days (within
  // LOOKAHEAD_DAYS) that do. null = not looked yet, [] = nothing nearby.
  const [nextAvailable, setNextAvailable] = useState<string[] | null>(null);
  const [lookingAhead, setLookingAhead] = useState(false);

  const [name, setName] = useState("");
  // Either a phone number or an email address — resolved server-side (see
  // ./actions.ts's startOtp/verifyAndBook, which pass this raw value
  // straight to requestOtp/verifyOtp for classification).
  const [identifier, setIdentifier] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; identifier?: string; code?: string }>({});
  // Optional gift-card code, entered alongside the OTP code -- applied
  // best-effort by verifyAndBook (a bad/unknown/expired code never blocks
  // the booking itself; see ./actions.ts's applyGiftCardBestEffort).
  const [giftCardCode, setGiftCardCode] = useState("");

  const [summary, setSummary] = useState<BookingSummaryDTO | null>(null);
  const [restored, setRestored] = useState(false);

  // "Join the waitlist" affordance, offered on the date/time step once a
  // chosen day comes back with no bookable slot for the selected service.
  // Deliberately its own name/identifier fields (rather than reusing the
  // step-3 contact fields above) since it can be submitted before the
  // client ever reaches step 3.
  const [waitlistName, setWaitlistName] = useState("");
  const [waitlistIdentifier, setWaitlistIdentifier] = useState("");
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [waitlistFieldErrors, setWaitlistFieldErrors] = useState<{ name?: string; identifier?: string }>({});
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

  const headingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

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

  const loadSlots = useCallback(
    (serviceId: string, dateISO: string, keepSlot: SlotDTO | null = null) => {
      startTransition(async () => {
        const result = await getSlots(serviceId, dateISO, locale);
        if (!result.ok) {
          setSlotsError(result.error);
          return;
        }
        setSlots(result.slots);
        if (keepSlot && !result.slots.some((s) => s.startAt === keepSlot.startAt)) {
          // The remembered time is gone (taken, or the day changed) — pick again.
          setSelectedSlot(null);
        }
        if (result.slots.length === 0) {
          // Look a few days ahead so the empty state can offer real alternatives.
          setLookingAhead(true);
          const found: string[] = [];
          const start = next14Days.indexOf(dateISO);
          const candidates = start >= 0 ? next14Days.slice(start + 1, start + 1 + LOOKAHEAD_DAYS) : [];
          for (const day of candidates) {
            const r = await getSlots(serviceId, day, locale);
            if (r.ok && r.slots.length > 0) found.push(day);
            if (found.length >= 3) break;
          }
          setNextAvailable(found);
          setLookingAhead(false);
        }
      });
    },
    [locale, next14Days],
  );

  // One-tap rebooking (account page's "Book again"): when the page was
  // reached via /book?service=<slug>&staff=<staffUserId>, initialServiceId
  // above already seeded step 2 -- this effect does the async part, landing
  // on the next available slot for that service. It prefers the same staff
  // member when one of their slots is free on that day, otherwise falls
  // back to the first free slot on the first day that has one.
  //
  // Otherwise, a reload resumes the selection saved in sessionStorage (the
  // slot list is refetched so a stale time is never offered). Runs once on
  // mount only; everything it reads is a mount-time input.
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    if (initialServiceId) {
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
      return;
    }

    const draft = readDraft();
    if (!draft || !draft.serviceId || !services.some((s) => s.id === draft.serviceId)) return;
    const validDate = draft.dateISO && next14Days.includes(draft.dateISO) ? draft.dateISO : null;
    startTransition(() => {
      setSelectedServiceId(draft.serviceId);
      setName(draft.name);
      setIdentifier(draft.identifier);
      setSelectedDate(validDate);
      setSelectedSlot(validDate ? draft.slot : null);
      setStep(validDate && draft.slot && draft.step === 3 ? 3 : 2);
      setRestored(true);
    });
    if (validDate) loadSlots(draft.serviceId, validDate, draft.slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the selection to sessionStorage (cleared once the booking is made).
  useEffect(() => {
    if (!mounted.current) return;
    if (step === 4 || !selectedServiceId) {
      writeDraft(null);
      return;
    }
    writeDraft({ step, serviceId: selectedServiceId, dateISO: selectedDate, slot: selectedSlot, name, identifier });
  }, [step, selectedServiceId, selectedDate, selectedSlot, name, identifier]);

  // Focus management: each step change lands on its heading so keyboard and
  // screen-reader users know where they are; errors pull focus to the alert.
  useEffect(() => {
    if (!mounted.current) return;
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (contactError) alertRef.current?.focus();
  }, [contactError]);

  function resetWaitlistState() {
    setWaitlistName("");
    setWaitlistIdentifier("");
    setWaitlistError(null);
    setWaitlistFieldErrors({});
    setWaitlistJoined(false);
  }

  function resetDateState() {
    setSelectedDate(null);
    setSlots(null);
    setSlotsError(null);
    setSelectedSlot(null);
    setNextAvailable(null);
    resetWaitlistState();
  }

  function selectService(serviceId: string) {
    setSelectedServiceId(serviceId);
    resetDateState();
    setRestored(false);
    setStep(2);
  }

  function selectDate(dateISO: string) {
    setSelectedDate(dateISO);
    setSelectedSlot(null);
    setSlots(null);
    setSlotsError(null);
    setNextAvailable(null);
    resetWaitlistState();
    if (!selectedServiceId) return;
    loadSlots(selectedServiceId, dateISO);
  }

  function goToStep(target: Step) {
    if (target >= step) return;
    setContactError(null);
    setFieldErrors({});
    setStep(target);
  }

  function validateWaitlist() {
    const errs: { name?: string; identifier?: string } = {};
    if (!waitlistName.trim()) errs.name = t("errors.nameRequired");
    if (!waitlistIdentifier.trim()) errs.identifier = t("errors.identifierRequired");
    else if (!isValidIdentifier(waitlistIdentifier)) errs.identifier = t("errors.invalidIdentifier");
    setWaitlistFieldErrors(errs);
    return !errs.name && !errs.identifier;
  }

  function handleJoinWaitlist() {
    setWaitlistError(null);
    if (!validateWaitlist()) return;
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

  function validateName(value: string) {
    const err = value.trim().length >= 2 ? undefined : t("errors.nameRequired");
    setFieldErrors((prev) => ({ ...prev, name: err }));
    return !err;
  }

  function validateIdentifier(value: string) {
    const v = value.trim();
    const err = !v ? t("errors.identifierRequired") : isValidIdentifier(v) ? undefined : t("errors.invalidIdentifier");
    setFieldErrors((prev) => ({ ...prev, identifier: err }));
    return !err;
  }

  function validateCode(value: string) {
    const err = value.length === 6 ? undefined : t("errors.codeIncomplete");
    setFieldErrors((prev) => ({ ...prev, code: err }));
    return !err;
  }

  function handleSendCode() {
    setContactError(null);
    const nameOk = validateName(name);
    const idOk = validateIdentifier(identifier);
    if (!nameOk || !idOk) {
      (nameOk ? identifierRef : nameRef).current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await startOtp(identifier, locale);
      if (result.ok) {
        setOtpSent(true);
        setDevCode(result.devCode ?? null);
        // The code field is what matters now.
        requestAnimationFrame(() => codeRef.current?.focus());
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
    if (!validateCode(code)) {
      codeRef.current?.focus();
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
    resetDateState();
    setName("");
    setIdentifier("");
    setOtpSent(false);
    setDevCode(null);
    setCode("");
    setContactError(null);
    setFieldErrors({});
    setGiftCardCode("");
    setSummary(null);
    setMyPackages(null);
    setSelectedPackageId("");
    setPackageApplyState("idle");
    setPackageApplyError(null);
    setRestored(false);
    writeDraft(null);
  }

  const stepLabels = [t("steps.service"), t("steps.datetime"), t("steps.contact"), t("steps.confirm")];
  const loadingSlots = isPending && selectedDate !== null && slots === null && !slotsError;
  const showSummary = (step === 2 || step === 3) && selectedService;

  return (
    <div className="flex flex-col gap-10" data-testid="booking-wizard">
      {/* Step indicator: completed steps are buttons that jump back. */}
      <nav aria-label={t("progressLabel", { step, total: TOTAL_STEPS })}>
        <ol className="lx-stepper">
          {stepLabels.map((label, index) => {
            const stepNumber = (index + 1) as Step;
            const isCurrent = stepNumber === step;
            const isDone = stepNumber < step;
            const isLast = index === stepLabels.length - 1;
            const state = isDone ? "done" : isCurrent ? "current" : "todo";
            const inner = (
              <>
                <span className="lx-step-dot" aria-hidden="true">
                  {isDone ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                    </svg>
                  ) : (
                    stepNumber
                  )}
                </span>
                <span className="lx-step-label" aria-hidden="true">
                  {label}
                </span>
                <span className="sr-only">
                  {t("stepper.stepName", { number: stepNumber, name: label })}
                  {isDone ? ` ${t("stepper.completed")}` : ""}
                </span>
              </>
            );
            return (
              <li key={label} aria-current={isCurrent ? "step" : undefined} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
                {isDone && step !== 4 ? (
                  <button
                    type="button"
                    onClick={() => goToStep(stepNumber)}
                    className="lx-step-btn"
                    data-state={state}
                    data-testid={`booking-step-link-${stepNumber}`}
                    aria-label={t("stepper.goBackTo", { step: label })}
                  >
                    {inner}
                  </button>
                ) : (
                  <span className="lx-step-btn" data-state={state}>
                    {inner}
                  </span>
                )}
                {!isLast && <span aria-hidden="true" className="lx-step-line mx-2" data-done={isDone ? "true" : "false"} />}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Sticky selection summary on phones (desktop shows it inline). */}
      {showSummary && (
        <div className="lx-sticky-summary" data-testid="booking-sticky-summary">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-[var(--color-ink)]">{selectedService.name}</span>
            {selectedSlot && (
              <span className="text-[var(--color-ink)]/75">
                {" · "}
                {formatShortDate(toCenterDateISO(new Date(selectedSlot.startAt)), locale)} · {formatTime(selectedSlot.startAt, locale)}
              </span>
            )}
          </span>
          <button type="button" onClick={() => goToStep(step === 3 && selectedSlot ? 2 : 1)} className="lx-pill lx-pill-ghost px-3.5 py-1.5 text-[0.8rem]">
            {t("summary.change")}
          </button>
        </div>
      )}

      {restored && step !== 4 && (
        <p role="status" className="lx-notice lx-notice-info flex flex-wrap items-center justify-between gap-3" data-testid="booking-restored">
          <span>{t("resume.restored")}</span>
          <button type="button" onClick={resetForAnotherBooking} className="lx-link text-[0.9rem]">
            {t("resume.startOver")}
          </button>
        </p>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-8" data-testid="booking-step-service">
          <h2 ref={headingRef} tabIndex={-1} className="lx-display text-3xl text-[var(--color-ink)] outline-none">
            {t("service.heading")}
          </h2>
          {services.length === 0 ? (
            <div className="lx-surface flex flex-col items-start gap-4 rounded-[24px] p-6">
              <p className="text-sm text-[var(--color-ink)]/75">{t("service.emptyState")}</p>
              <Link href={`/${locale}/contact`} className="lx-pill">
                {t("service.emptyCta")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-10" role="group" aria-label={t("service.chooseLabel")}>
              {groupedServices.map((group) => (
                <div key={group.departmentName} className="flex flex-col gap-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-teal-ink)] rtl:tracking-normal">
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
                        className="lx-choice flex min-h-[4.5rem] flex-col gap-2 p-5"
                      >
                        <span className="text-base font-medium text-[var(--color-ink)]">{service.name}</span>
                        <span className="text-sm text-[var(--color-ink)]/75">
                          {t("service.durationValue", { minutes: service.durationMin })} · {formatSar(service.priceMinor, locale)}
                        </span>
                        {service.tierNote && (
                          <span className="text-xs font-medium text-[var(--color-gold-ink)]">
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
            <h2 ref={headingRef} tabIndex={-1} className="lx-display text-3xl text-[var(--color-ink)] outline-none">
              {t("date.heading")}
            </h2>
            <button type="button" onClick={() => goToStep(1)} className="lx-pill lx-pill-ghost px-5 py-2 text-sm">
              {t("backLabel")}
            </button>
          </div>

          {selectedService && (
            <p className="hidden text-sm text-[var(--color-ink)]/75 lg:block">
              {selectedService.name} · {t("service.durationValue", { minutes: selectedService.durationMin })} · {formatSar(selectedService.priceMinor, locale)}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <span id={dateId} className="lx-label">
              {t("date.dateLabel")}
            </span>
            <div role="group" aria-labelledby={dateId} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
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
                    className="lx-choice flex min-h-[4rem] shrink-0 flex-col items-center gap-1 px-4 py-3"
                  >
                    <span className="text-xs uppercase tracking-wide text-[var(--color-ink)]/75 rtl:tracking-normal">{weekday}</span>
                    <span className="text-sm font-medium text-[var(--color-ink)]">{day}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedDate && (
            <div className="flex flex-col gap-3" aria-live="polite" aria-busy={loadingSlots || undefined}>
              <span className="lx-label">{t("date.timeHeading")}</span>
              {loadingSlots && (
                <div className="flex flex-col gap-3" data-testid="booking-slots-loading">
                  <p className="text-sm text-[var(--color-ink)]/75">{t("date.loadingSlots")}</p>
                  <div className="flex flex-wrap gap-2" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, i) => (
                      <span key={i} className="lx-skeleton h-11 w-24" />
                    ))}
                  </div>
                </div>
              )}
              {slotsError && (
                <p role="alert" className="lx-notice lx-notice-error">
                  {slotsError}
                </p>
              )}
              {slots && slots.length === 0 && (
                <div className="flex flex-col gap-5" data-testid="booking-no-slots">
                  <div className="lx-surface flex flex-col gap-4 rounded-[24px] p-6">
                    <div className="flex flex-col gap-1">
                      <h3 className="lx-display text-2xl text-[var(--color-ink)]">{t("date.noSlotsHeading")}</h3>
                      <p className="text-sm text-[var(--color-ink)]/75">{t("date.noSlots")}</p>
                    </div>
                    {lookingAhead && (
                      <p className="text-sm text-[var(--color-ink)]/75" role="status">
                        {t("date.checkingNext")}
                      </p>
                    )}
                    {nextAvailable && nextAvailable.length > 0 && (
                      <div className="flex flex-col gap-3">
                        <span className="lx-label">{t("date.nextAvailable")}</span>
                        <div className="flex flex-wrap gap-2" data-testid="booking-next-available">
                          {nextAvailable.map((day) => (
                            <button key={day} type="button" data-next-date={day} onClick={() => selectDate(day)} className="lx-choice lx-choice-pill min-h-11 px-5 py-2 text-sm font-medium">
                              {formatShortDate(day, locale)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {nextAvailable && nextAvailable.length === 0 && !lookingAhead && (
                      <p className="text-sm text-[var(--color-ink)]/75">{t("date.noneNearby")}</p>
                    )}
                  </div>

                  <div className="lx-surface lunia-animate-fade-in flex flex-col gap-4 rounded-[24px] p-6" data-testid="booking-waitlist-form">
                    {waitlistJoined ? (
                      <p role="status" className="lx-notice lx-notice-success" data-testid="booking-waitlist-joined">
                        {t("waitlist.joinedMessage")}
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1">
                          <h3 className="text-base font-medium text-[var(--color-ink)]">{t("waitlist.heading")}</h3>
                          <p className="text-sm text-[var(--color-ink)]/75">{t("waitlist.intro")}</p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <label htmlFor={waitlistNameId} className="lx-label">
                              {t("contact.nameLabel")}
                            </label>
                            <input
                              id={waitlistNameId}
                              type="text"
                              maxLength={200}
                              autoComplete="name"
                              value={waitlistName}
                              onChange={(e) => setWaitlistName(e.target.value)}
                              onBlur={() => setWaitlistFieldErrors((p) => ({ ...p, name: waitlistName.trim() ? undefined : t("errors.nameRequired") }))}
                              aria-invalid={waitlistFieldErrors.name ? true : undefined}
                              aria-describedby={waitlistFieldErrors.name ? `${waitlistNameId}-err` : undefined}
                              className="lx-input"
                            />
                            <FieldError id={`${waitlistNameId}-err`} message={waitlistFieldErrors.name} />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label htmlFor={waitlistIdentifierId} className="lx-label">
                              {t("contact.identifierLabel")}
                            </label>
                            <input
                              id={waitlistIdentifierId}
                              type="text"
                              inputMode="email"
                              dir="ltr"
                              maxLength={254}
                              value={waitlistIdentifier}
                              onChange={(e) => setWaitlistIdentifier(e.target.value)}
                              onBlur={() => validateWaitlist()}
                              aria-invalid={waitlistFieldErrors.identifier ? true : undefined}
                              aria-describedby={waitlistFieldErrors.identifier ? `${waitlistIdentifierId}-err` : undefined}
                              className="lx-input text-start"
                            />
                            <FieldError id={`${waitlistIdentifierId}-err`} message={waitlistFieldErrors.identifier} />
                          </div>
                        </div>

                        {waitlistError && (
                          <p role="alert" className="lx-notice lx-notice-error">
                            {waitlistError}
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={handleJoinWaitlist}
                          disabled={waitlistPending}
                          aria-busy={waitlistPending || undefined}
                          className="lx-pill lx-pill-ghost w-fit"
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
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("date.timeHeading")} data-testid="booking-slots">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.startAt === slot.startAt;
                    return (
                      <button
                        key={slot.startAt}
                        type="button"
                        data-slot-time={slot.startAt}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedSlot(slot)}
                        className="lx-choice lx-choice-pill min-h-11 px-4 py-2 text-sm font-medium"
                      >
                        {formatTime(slot.startAt, locale)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button type="button" onClick={goToContactStep} disabled={!selectedSlot} className="lx-pill w-fit">
            {t("date.continueLabel")}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-6" data-testid="booking-step-contact">
          <div className="flex items-center justify-between gap-4">
            <h2 ref={headingRef} tabIndex={-1} className="lx-display text-3xl text-[var(--color-ink)] outline-none">
              {t("contact.heading")}
            </h2>
            <button type="button" onClick={() => goToStep(2)} className="lx-pill lx-pill-ghost px-5 py-2 text-sm">
              {t("backLabel")}
            </button>
          </div>

          {selectedService && selectedSlot && (
            <p className="hidden text-sm text-[var(--color-ink)]/75 lg:block">
              {selectedService.name} · {formatDate(selectedSlot.startAt, locale)} · {formatTime(selectedSlot.startAt, locale)}
            </p>
          )}

          <p className="text-sm leading-relaxed text-[var(--color-ink)]/75">{t("contact.intro")}</p>

          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="lx-label">
              {t("contact.nameLabel")}
            </label>
            <input
              ref={nameRef}
              id={nameId}
              type="text"
              required
              maxLength={200}
              autoComplete="name"
              value={name}
              disabled={otpSent}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) validateName(e.target.value);
              }}
              onBlur={(e) => validateName(e.target.value)}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? `${nameId}-err` : undefined}
              className="lx-input"
            />
            <FieldError id={`${nameId}-err`} message={fieldErrors.name} />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={identifierId} className="lx-label">
              {t("contact.identifierLabel")}
            </label>
            <input
              ref={identifierRef}
              id={identifierId}
              type="text"
              inputMode="email"
              dir="ltr"
              required
              maxLength={254}
              value={identifier}
              disabled={otpSent}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (fieldErrors.identifier) validateIdentifier(e.target.value);
              }}
              onBlur={(e) => validateIdentifier(e.target.value)}
              aria-invalid={fieldErrors.identifier ? true : undefined}
              aria-describedby={`${identifierId}-help${fieldErrors.identifier ? ` ${identifierId}-err` : ""}`}
              className="lx-input text-start"
            />
            <p id={`${identifierId}-help`} className="lx-help">
              {t("contact.identifierHelp")}
            </p>
            <FieldError id={`${identifierId}-err`} message={fieldErrors.identifier} />
          </div>

          {!otpSent ? (
            <button type="button" onClick={handleSendCode} disabled={isPending} aria-busy={isPending || undefined} className="lx-pill w-fit">
              {isPending ? t("contact.sendingLabel") : t("contact.sendCodeLabel")}
            </button>
          ) : (
            <>
              <p role="status" className="lx-notice lx-notice-info">
                {t("contact.codeIntro", { contact: identifier })}
              </p>
              {devCode && (
                <p data-testid="dev-otp-code" className="text-sm font-medium text-[var(--color-teal-ink)]">
                  {t("contact.devCodeHint", { code: devCode })}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <label htmlFor={codeId} className="lx-label">
                  {t("contact.codeLabel")}
                </label>
                <input
                  ref={codeRef}
                  id={codeId}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  dir="ltr"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(v);
                    if (fieldErrors.code && v.length === 6) validateCode(v);
                  }}
                  onBlur={(e) => {
                    if (e.target.value) validateCode(e.target.value);
                  }}
                  aria-invalid={fieldErrors.code ? true : undefined}
                  aria-describedby={`${codeId}-help${fieldErrors.code ? ` ${codeId}-err` : ""}`}
                  className="lx-input max-w-[12rem] text-start font-mono text-xl tracking-[0.3em]"
                />
                <p id={`${codeId}-help`} className="lx-help">
                  {t("contact.codeHelp")}
                </p>
                <FieldError id={`${codeId}-err`} message={fieldErrors.code} />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor={giftCardId} className="lx-label">
                  {t("contact.giftCardLabel")}
                </label>
                <input
                  id={giftCardId}
                  type="text"
                  autoCapitalize="characters"
                  dir="ltr"
                  placeholder={t("contact.giftCardPlaceholder")}
                  value={giftCardCode}
                  onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                  aria-describedby={`${giftCardId}-help`}
                  className="lx-input text-start"
                />
                <p id={`${giftCardId}-help`} className="lx-help">
                  {t("contact.giftCardHint")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handleConfirmBooking}
                  disabled={isPending || code.length !== 6}
                  aria-busy={isPending || undefined}
                  className="lx-pill"
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
                    setFieldErrors({});
                    requestAnimationFrame(() => identifierRef.current?.focus());
                  }}
                  className="lx-link text-[0.9rem]"
                >
                  {t("contact.changeContactLabel")}
                </button>
              </div>
            </>
          )}

          {contactError && (
            <p ref={alertRef} tabIndex={-1} role="alert" className="lx-notice lx-notice-error outline-none">
              {contactError}
            </p>
          )}
        </div>
      )}

      {step === 4 && summary && (
        <div className="flex flex-col gap-6" data-testid="booking-step-success">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-teal)]/30 text-[var(--color-teal-ink)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h2 ref={headingRef} tabIndex={-1} className="lx-display text-3xl text-[var(--color-ink)] outline-none">
              {t("success.heading")}
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-[var(--color-ink)]/75">{t("success.intro")}</p>

          <dl className="lx-surface flex flex-col gap-3 rounded-[24px] p-6 text-sm text-[var(--color-ink)]/80">
            {selectedService && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-ink)]/75">{t("success.serviceLabel")}</dt>
                <dd className="text-end font-medium text-[var(--color-ink)]">{selectedService.name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-ink)]/75">{t("success.dateLabel")}</dt>
              <dd className="text-end font-medium text-[var(--color-ink)]">{formatDate(summary.startAt, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-ink)]/75">{t("success.timeLabel")}</dt>
              <dd className="text-end font-medium text-[var(--color-ink)]">{formatTime(summary.startAt, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-ink)]/75">{t("success.priceLabel")}</dt>
              <dd className="text-end font-medium text-[var(--color-ink)]">{formatSar(summary.priceMinorSnapshot, locale)}</dd>
            </div>
            {summary.giftCardAppliedMinor !== undefined && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-ink)]/75">{t("success.giftCardAppliedLabel")}</dt>
                <dd className="text-end font-medium text-[var(--color-teal-ink)]">{formatSar(summary.giftCardAppliedMinor, locale)}</dd>
              </div>
            )}
          </dl>

          {myPackages && myPackages.length > 0 && (
            <div className="lx-surface flex flex-col gap-3 rounded-[24px] p-6" data-testid="booking-apply-package">
              <span className="lx-label">{t("success.usePackageLabel")}</span>
              {packageApplyState === "applied" ? (
                <p role="status" className="lx-notice lx-notice-success">
                  {t("success.packageAppliedLabel")}
                </p>
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
                      className="lx-input w-auto min-w-[14rem]"
                    >
                      <option value="">{t("success.selectPackagePlaceholder")}</option>
                      {myPackages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {locale === "ar" ? pkg.nameAr : pkg.nameEn}{" "}
                          {t("success.sessionsRemainingOption", { remaining: pkg.sessionsRemaining, total: pkg.sessionsTotal })}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleApplyPackage}
                      disabled={!selectedPackageId || packageApplyState === "applying"}
                      aria-busy={packageApplyState === "applying" || undefined}
                      className="lx-pill lx-pill-ghost"
                    >
                      {packageApplyState === "applying" ? t("success.applyingLabel") : t("success.applyPackageLabel")}
                    </button>
                  </div>
                  {packageApplyState === "error" && packageApplyError && (
                    <p role="alert" className="lx-notice lx-notice-error">
                      {packageApplyError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <Link href={`/${locale}/account`} className="lx-pill">
              {t("success.accountLabel")}
            </Link>
            <button type="button" onClick={resetForAnotherBooking} className="lx-pill lx-pill-ghost">
              {t("success.bookAnotherLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
