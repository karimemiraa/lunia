// The assistant's conversation state machine. Given the stored session and
// one visitor input (typed text or a tapped chip), it returns the updated
// session and the bot's replies. All I/O goes through `AssistantPorts`, so the
// transitions are unit-testable with fakes; the server wires real ports
// (booking, OTP, call-backs, lead capture) in service.ts.

import type { BusinessSettings, HoursSettings } from "@/modules/cms/settings";
import { formatSar } from "@/lib/siteMedia";
import { utcToCenterLocal } from "@/modules/booking/availability";
import {
  CONCERN_LABELS,
  EVENT_LABELS,
  GOAL_LABELS,
  SKIN_TYPE_LABELS,
  WINDOW_LABELS,
  copy,
  dayName,
  describeDuration,
  formatClock,
  listConcerns,
  whyFor,
  type Copy,
  type Locale,
} from "./copy";
import { openDays, openState } from "./hours";
import { cleanPersonName, type Expecting, type NluEngine } from "./nlu/rules";
import { displayPhone, normalizePhone } from "./phone";
import { domainOf, isOnlineBookable, recommendServices, type CatalogService } from "./recommend";
import {
  CALLBACK_WINDOWS,
  CONCERNS,
  CONTRAINDICATIONS,
  GOALS,
  SKIN_TYPES,
  emptyProfile,
  type CallbackWindow,
  type ChatMessageView,
  type ChipView,
  type Concern,
  type ConsultProfile,
  type InputKind,
  type Understanding,
} from "./types";

export type StateName =
  | "ask_concern"
  | "ask_duration"
  | "ask_tried"
  | "ask_goal"
  | "ask_when"
  | "ask_skin"
  | "ask_safety"
  | "recommend"
  | "menu"
  | "faq_menu"
  | "book_service"
  | "book_day"
  | "book_slot"
  | "book_name"
  | "book_phone"
  | "book_otp"
  | "cb_name"
  | "cb_phone"
  | "cb_window";

type Question = "concern" | "duration" | "tried" | "goal" | "skin" | "safety";
const QUESTION_STATE: Record<Question, StateName> = {
  concern: "ask_concern",
  duration: "ask_duration",
  tried: "ask_tried",
  goal: "ask_goal",
  skin: "ask_skin",
  safety: "ask_safety",
};
const MAX_QUESTIONS = 6;

export type Outcome = "BOOKED" | "CALLBACK" | "WHATSAPP" | "LEAD";
const OUTCOME_RANK: Record<Outcome, number> = { LEAD: 1, WHATSAPP: 2, CALLBACK: 3, BOOKED: 4 };

export interface Flow {
  asked: Question[];
  misses: number;
  chips: ChipView[];
  input: InputKind;
  returnTo?: StateName;
  bookServiceId?: string;
  dayPage?: number;
  day?: string;
  slots?: string[];
  slotAt?: string;
  otpTries?: number;
}

export interface Session {
  state: StateName;
  locale: Locale;
  profile: ConsultProfile;
  flow: Flow;
  name?: string;
  phone?: string;
  outcome?: Outcome;
  bookingId?: string;
  recommendedServiceIds: string[];
}

export type Reply = Omit<ChatMessageView, "id" | "from">;

export interface BookResult {
  ok: boolean;
  bookingId?: string;
  startAt?: string;
  priceMinor?: number;
  reason?: "code" | "taken" | "tier" | "unavailable" | "error";
  tierName?: string;
}

export interface AssistantPorts {
  now: Date;
  catalog: CatalogService[];
  hours: HoursSettings | null;
  business: BusinessSettings | null;
  nlu: NluEngine;
  getSlots(serviceId: string, dateISO: string): Promise<string[]>;
  sendOtp(phone: string, locale: Locale): Promise<{ ok: true; devCode?: string } | { ok: false; reason: "rate" | "invalid" | "error" }>;
  book(input: { serviceId: string; startAt: string; name: string; phone: string; code: string; locale: Locale }): Promise<BookResult>;
  requestCallback(input: { name: string; phone: string; window: CallbackWindow; locale: Locale; session: Session }): Promise<{ ok: boolean; dueAt?: Date }>;
  /** Called whenever contact details or the outcome change (idempotent). */
  captureLead(session: Session): Promise<void>;
}

export type Input = { kind: "text"; text: string } | { kind: "choice"; value: string };

export interface AdvanceResult {
  session: Session;
  /** The visitor's message as it should appear in the transcript. */
  userText: string;
  replies: Reply[];
}

// --- Construction -------------------------------------------------------

export function newSession(locale: Locale): Session {
  const session: Session = {
    state: "ask_concern",
    locale,
    profile: emptyProfile(),
    flow: { asked: [], misses: 0, chips: [], input: "text" },
    recommendedServiceIds: [],
  };
  session.flow.chips = concernChips(session);
  return session;
}

export function greeting(locale: Locale): Reply {
  return { text: copy(locale).greeting };
}

// --- Helpers ------------------------------------------------------------

const chip = (value: string, label: string, tone?: ChipView["tone"]): ChipView => (tone ? { value, label, tone } : { value, label });

function concernChips(s: Session): ChipView[] {
  const c = copy(s.locale);
  const featured: Concern[] = ["acne", "pigmentation", "dullness", "dryness", "sensitivity", "aging", "pores", "hair_loss", "dandruff", "post_surgery"];
  return [
    ...featured.map((k) => chip(`concern:${k}`, CONCERN_LABELS[k][s.locale])),
    chip("concern:other", c.chip.other),
    chip("book", c.chip.bookDirect),
    chip("faq", c.chip.questions),
    chip("callback", c.chip.callMe),
  ];
}

function menuChips(s: Session): ChipView[] {
  const c = copy(s.locale);
  const out: ChipView[] = [];
  if (s.recommendedServiceIds.length > 0) out.push(chip("recs", c.chip.recs));
  else out.push(chip("consult", c.chip.consult));
  out.push(chip("book", c.chip.bookAppointment), chip("callback", c.chip.callMe), chip("whatsapp", c.chip.whatsapp), chip("faq", c.chip.questions));
  return out;
}

function faqChips(s: Session): ChipView[] {
  const c = copy(s.locale).chip;
  return [
    chip("faq:hours", c.faqHours),
    chip("faq:location", c.faqLocation),
    chip("faq:prices", c.faqPrices),
    chip("faq:giftcards", c.faqGift),
    chip("faq:payment", c.faqPayment),
    chip("faq:parking", c.faqParking),
    chip("faq:duration", c.faqDuration),
    chip("back", c.back),
  ];
}

function serviceName(s: CatalogService, locale: Locale): string {
  return locale === "ar" ? s.nameAr : s.nameEn;
}

function setOutcome(s: Session, outcome: Outcome): void {
  if (!s.outcome || OUTCOME_RANK[outcome] > OUTCOME_RANK[s.outcome]) s.outcome = outcome;
}

function isCareful(s: Session): boolean {
  return recommendServices(s.profile, []).careful;
}

function inferAreas(p: ConsultProfile): void {
  const areas = new Set(p.areas);
  for (const c of p.concerns) {
    const d = domainOf(c);
    areas.add(d === "hair" ? "scalp" : d === "post_surgery" ? "body" : "face");
  }
  p.areas = [...areas];
}

/** Merges what was understood into the profile; returns whether anything new landed. */
export function mergeIntoProfile(p: ConsultProfile, u: Understanding): boolean {
  let changed = false;
  const addAll = <T>(list: T[], items: T[]) => {
    for (const item of items) {
      if (!list.includes(item)) {
        list.push(item);
        changed = true;
      }
    }
  };
  addAll(p.concerns, u.concerns);
  addAll(p.areas, u.areas);
  addAll(p.goals, u.goals);
  addAll(p.previousTreatments, u.previousTreatments);
  addAll(p.contraindications, u.contraindications);
  if (u.skinType && !p.skinType) {
    p.skinType = u.skinType;
    changed = true;
  }
  if (u.event && !p.event) {
    p.event = u.event;
    changed = true;
  }
  if (u.durationMonths !== undefined && p.durationMonths === undefined) {
    p.durationMonths = u.durationMonths;
    changed = true;
  }
  if (u.timelineWeeks !== undefined && p.timelineWeeks === undefined) {
    p.timelineWeeks = u.timelineWeeks;
    changed = true;
  }
  if (u.triedNothing && !p.triedText) {
    p.triedText = "none";
    changed = true;
  }
  if (u.contraindications.length > 0 || u.noContraindications) p.safetyAnswered = true;
  inferAreas(p);
  return changed;
}

function answered(p: ConsultProfile, q: Question): boolean {
  switch (q) {
    case "concern":
      return p.concerns.length > 0;
    case "duration":
      return p.durationMonths !== undefined || !!p.durationText;
    case "tried":
      return p.previousTreatments.length > 0 || !!p.triedText;
    case "goal":
      return p.goals.length > 0 || !!p.event || p.timelineWeeks !== undefined;
    case "skin":
      return !!p.skinType || !p.concerns.some((c) => domainOf(c) === "skin");
    case "safety":
      return !!p.safetyAnswered || p.contraindications.length > 0;
  }
}

function nextQuestion(s: Session): Question | null {
  if (s.flow.asked.length >= MAX_QUESTIONS) return null;
  const order: Question[] = ["concern", "duration", "tried", "goal", "skin", "safety"];
  for (const q of order) {
    if (s.flow.asked.includes(q) || answered(s.profile, q)) continue;
    // Post-surgery visitors skip the "what have you tried" question.
    if (q === "tried" && s.profile.concerns.length > 0 && s.profile.concerns.every((c) => c === "post_surgery")) continue;
    return q;
  }
  return null;
}

function expectingFor(state: StateName): Expecting {
  switch (state) {
    case "ask_concern":
      return "concern";
    case "ask_duration":
      return "duration";
    case "ask_tried":
      return "tried";
    case "ask_goal":
    case "ask_when":
      return "goal";
    case "ask_skin":
      return "skin_type";
    case "ask_safety":
      return "safety";
    case "book_name":
    case "cb_name":
      return "name";
    case "book_phone":
    case "cb_phone":
      return "phone";
    case "book_otp":
      return "code";
    default:
      return "free";
  }
}

function inputFor(state: StateName): InputKind {
  if (state === "book_name" || state === "cb_name") return "name";
  if (state === "book_phone" || state === "cb_phone") return "tel";
  if (state === "book_otp") return "code";
  return "text";
}

function relativeDay(dateISO: string, now: Date, c: Copy, locale: Locale): string {
  const today = utcToCenterLocal(now).dateISO;
  if (dateISO === today) return c.today;
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (dateISO === tomorrow.toISOString().slice(0, 10)) return c.tomorrow;
  const d = new Date(`${dateISO}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

function shortDay(dateISO: string, now: Date, c: Copy, locale: Locale): string {
  const rel = relativeDay(dateISO, now, c, locale);
  if (rel === c.today || rel === c.tomorrow) return rel.charAt(0).toUpperCase() + rel.slice(1);
  const d = new Date(`${dateISO}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

function timeLabel(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(iso));
}

// --- The engine ---------------------------------------------------------

class Turn {
  readonly replies: Reply[] = [];
  readonly c: Copy;
  constructor(
    readonly s: Session,
    readonly ports: AssistantPorts,
  ) {
    this.c = copy(s.locale);
  }

  say(text: string, extra: Omit<Reply, "text"> = {}): void {
    this.replies.push({ text, ...extra });
  }

  go(state: StateName, chips: ChipView[]): void {
    this.s.state = state;
    this.s.flow.chips = chips;
    this.s.flow.input = inputFor(state);
  }

  service(id: string | undefined): CatalogService | undefined {
    return id ? this.ports.catalog.find((x) => x.id === id) : undefined;
  }

  // ---- Intake ----

  async continueIntake(): Promise<void> {
    const q = nextQuestion(this.s);
    if (!q) return this.recommend();
    this.s.flow.asked.push(q);
    this.askQuestion(q);
  }

  askQuestion(q: Question, prefix?: string): void {
    const c = this.c;
    const lead = prefix ? `${prefix} ` : "";
    const skip = chip("skip", c.chip.skip);
    switch (q) {
      case "concern":
        this.say(`${lead}${c.askConcern}`);
        this.go("ask_concern", concernChips(this.s));
        return;
      case "duration": {
        const surgery = this.s.profile.concerns.includes("post_surgery") && this.s.profile.concerns.length === 1;
        this.say(`${lead}${surgery ? c.askDurationSurgery : c.askDuration}`);
        this.go(
          "ask_duration",
          surgery
            ? [chip("ps:recent", c.chip.psRecent), chip("ps:mid", c.chip.psMid), chip("ps:long", c.chip.psLong), skip]
            : [chip("dur:short", c.chip.durShort), chip("dur:mid", c.chip.durMid), chip("dur:long", c.chip.durLong), chip("dur:years", c.chip.durYears), skip],
        );
        return;
      }
      case "tried":
        this.say(`${lead}${c.askTried}`);
        this.go("ask_tried", [chip("tried:none", c.chip.triedNone), chip("tried:home", c.chip.triedHome), chip("tried:clinic", c.chip.triedClinic), skip]);
        return;
      case "goal": {
        const domains = new Set(this.s.profile.concerns.map(domainOf));
        const goals = domains.has("post_surgery") && domains.size === 1
          ? (["recovery"] as const)
          : domains.has("hair") && domains.size === 1
            ? (["hair_growth", "scalp_health"] as const)
            : (["clear_skin", "glow", "even_tone", "anti_aging"] as const);
        this.say(`${lead}${c.askGoal}`);
        this.go("ask_goal", [...goals.map((g) => chip(`goal:${g}`, GOAL_LABELS[g][this.s.locale])), chip("goal:event", c.chip.goalEvent), skip]);
        return;
      }
      case "skin":
        this.say(`${lead}${c.askSkin}`);
        this.go("ask_skin", [
          ...SKIN_TYPES.map((t) => chip(`skin:${t}`, SKIN_TYPE_LABELS[t][this.s.locale])),
          chip("skin:unsure", c.chip.notSure),
        ]);
        return;
      case "safety":
        this.say(`${lead}${c.askSafety}`);
        this.go("ask_safety", [
          chip("safety:none", c.chip.safetyNone, "primary"),
          chip("safety:pregnant", c.chip.safetyPregnant),
          chip("safety:recent_procedure", c.chip.safetyRecent),
          chip("safety:infection", c.chip.safetyInfection),
          chip("safety:allergies", c.chip.safetyAllergy),
        ]);
        return;
    }
  }

  /** Re-shows the question the visitor is on (after an FAQ detour). */
  repromptCurrent(): void {
    const q = (Object.keys(QUESTION_STATE) as Question[]).find((k) => QUESTION_STATE[k] === this.s.state);
    if (q) return this.askQuestion(q, this.c.backToQuestion);
    if (this.s.state === "ask_when") {
      this.say(this.c.askWhen);
      return;
    }
    this.go("menu", menuChips(this.s));
  }

  // ---- Recommendation ----

  profileSummary(): string {
    const p = this.s.profile;
    const L = this.s.locale;
    const parts: string[] = [];
    if (p.concerns.length) parts.push(listConcerns(p.concerns, L));
    if (p.durationMonths !== undefined) parts.push(describeDuration(p.durationMonths, L));
    if (p.event) parts.push(L === "ar" ? `قبل ${EVENT_LABELS[p.event].ar}` : `before your ${EVENT_LABELS[p.event].en}`);
    else if (p.goals[0]) parts.push(GOAL_LABELS[p.goals[0]][L].toLowerCase());
    return parts.join(L === "ar" ? "، " : ", ");
  }

  recommend(updated = false): void {
    const c = this.c;
    const L = this.s.locale;
    const result = recommendServices(this.s.profile, this.ports.catalog);
    this.s.recommendedServiceIds = result.items.map((i) => i.service.id);

    const cards = result.items.map(({ service }) => ({
      serviceId: service.id,
      name: serviceName(service, L),
      duration: c.durationLabel(service.durationMin),
      price: c.priceFrom(formatSar(L, service.priceMinor)),
      why: whyFor(service.slug, L === "ar" ? service.summaryAr : service.summaryEn, L),
      bookable: !result.careful && isOnlineBookable(service),
      note: !isOnlineBookable(service) || result.careful ? c.recNotOnline : service.tierName ? c.recTierNote(service.tierName) : undefined,
    }));

    if (updated) this.say(c.recUpdated);
    if (result.careful) {
      this.say(c.recCareful, cards.length ? { cards } : {});
      this.go("recommend", [chip("callback", c.chip.callMe, "primary"), chip("whatsapp", c.chip.whatsapp), chip("faq", c.chip.questions)]);
      return;
    }

    const summary = this.profileSummary();
    const intro = result.unsure && this.s.profile.concerns.length === 0 ? c.recIntroUnsure : c.recIntro(summary || CONCERN_LABELS.dullness[L]);
    this.say(intro, { cards });
    const extras: string[] = [];
    if (result.unsure && this.s.profile.concerns.length > 0 && result.items[0]?.diagnostic) extras.push(c.recDiagnosticFirst);
    if (this.s.profile.timelineWeeks !== undefined && this.s.profile.timelineWeeks <= 6) extras.push(c.recEventSoon(this.s.profile.timelineWeeks));
    if (this.s.profile.contraindications.includes("allergies")) extras.push(c.recAllergyNote);
    extras.push(c.recWhatNext);
    this.say(extras.join(" "));

    const chips: ChipView[] = [];
    for (const item of result.items) {
      if (isOnlineBookable(item.service)) chips.push(chip(`book:${item.service.id}`, c.chip.book(serviceName(item.service, L)), chips.length === 0 ? "primary" : undefined));
    }
    chips.push(chip("callback", c.chip.callMe), chip("whatsapp", c.chip.whatsapp), chip("faq", c.chip.questions), chip("restart", c.chip.restart));
    this.go("recommend", chips);
  }

  // ---- Booking ----

  startBooking(serviceId?: string): Promise<void> | void {
    const c = this.c;
    if (isCareful(this.s)) {
      this.say(c.careful);
      this.go("menu", [chip("callback", c.chip.callMe, "primary"), chip("whatsapp", c.chip.whatsapp), chip("faq", c.chip.questions)]);
      return;
    }
    const svc = this.service(serviceId);
    if (svc) return this.chooseService(svc);
    const bookable = this.ports.catalog.filter(isOnlineBookable);
    const recFirst = [...bookable].sort(
      (a, b) => Number(this.s.recommendedServiceIds.includes(b.id)) - Number(this.s.recommendedServiceIds.includes(a.id)),
    );
    this.say(c.bookPickService);
    this.go("book_service", [...recFirst.slice(0, 12).map((x) => chip(`svc:${x.id}`, serviceName(x, this.s.locale))), chip("callback", c.chip.callMe)]);
  }

  chooseService(svc: CatalogService): void {
    const c = this.c;
    const L = this.s.locale;
    if (!isOnlineBookable(svc)) {
      this.say(c.bookNotOnline(serviceName(svc, L)));
      this.go("menu", [chip("callback", c.chip.callMe, "primary"), chip("whatsapp", c.chip.whatsapp), chip("book", c.chip.bookAppointment)]);
      return;
    }
    this.s.flow.bookServiceId = svc.id;
    this.s.flow.dayPage = 0;
    if (svc.tierName) this.say(c.bookTierGate(svc.tierName));
    this.say(c.bookPickDay(serviceName(svc, L)));
    this.showDays();
  }

  dayOptions(): string[] {
    return openDays(this.ports.hours, this.ports.now, 14);
  }

  showDays(): void {
    const c = this.c;
    const page = this.s.flow.dayPage ?? 0;
    const days = this.dayOptions();
    const visible = days.slice(page * 7, page * 7 + 7);
    const chips = visible.map((d) => chip(`day:${d}`, shortDay(d, this.ports.now, c, this.s.locale)));
    if (days.length > 7) chips.push(page === 0 ? chip("days:more", c.chip.moreDays) : chip("days:less", c.chip.earlierDays));
    chips.push(chip("callback", c.chip.callMe));
    this.go("book_day", chips);
  }

  async pickDay(dateISO: string): Promise<void> {
    const c = this.c;
    const svc = this.service(this.s.flow.bookServiceId);
    if (!svc) return this.startBooking();
    const slots = await this.ports.getSlots(svc.id, dateISO);
    this.s.flow.day = dateISO;
    if (slots.length === 0) {
      this.say(c.bookNoSlots);
      this.showDays();
      return;
    }
    this.s.flow.slots = slots.slice(0, 16);
    this.say(c.bookPickTime(relativeDay(dateISO, this.ports.now, c, this.s.locale)));
    this.go("book_slot", [...this.s.flow.slots.map((iso) => chip(`slot:${iso}`, timeLabel(iso, this.s.locale))), chip("days:again", c.chip.otherDay)]);
  }

  async pickSlot(iso: string): Promise<void> {
    this.s.flow.slotAt = iso;
    if (!this.s.name) {
      this.say(this.c.bookAskName);
      this.go("book_name", [chip("days:again", this.c.chip.otherDay)]);
      return;
    }
    return this.afterName();
  }

  async afterName(): Promise<void> {
    if (!this.s.phone) {
      this.say(this.c.bookAskPhone);
      this.go("book_phone", []);
      return;
    }
    this.say(this.c.bookUsingPhone(displayPhone(this.s.phone)));
    return this.sendCode();
  }

  async sendCode(): Promise<void> {
    const c = this.c;
    const phone = this.s.phone!;
    const res = await this.ports.sendOtp(phone, this.s.locale);
    if (!res.ok) {
      if (res.reason === "invalid") {
        this.s.phone = undefined;
        this.say(c.bookBadPhone);
        this.go("book_phone", []);
        return;
      }
      this.say(res.reason === "rate" ? c.bookOtpLimited : c.genericError);
      this.go("menu", [chip("callback", c.chip.callMe, "primary"), ...menuChips(this.s).filter((x) => x.value !== "callback")]);
      return;
    }
    this.s.flow.otpTries = 0;
    this.say(c.bookCodeSent(displayPhone(phone)));
    if (res.devCode) this.say(c.bookDevCode(res.devCode));
    this.go("book_otp", [chip("otp:resend", c.chip.resend), chip("otp:change", c.chip.changePhone)]);
  }

  async confirmCode(code: string): Promise<void> {
    const c = this.c;
    const L = this.s.locale;
    const svc = this.service(this.s.flow.bookServiceId);
    const startAt = this.s.flow.slotAt;
    if (!svc || !startAt || !this.s.name || !this.s.phone) return this.startBooking();
    const res = await this.ports.book({ serviceId: svc.id, startAt, name: this.s.name, phone: this.s.phone, code, locale: L });
    if (res.ok) {
      this.s.bookingId = res.bookingId;
      setOutcome(this.s, "BOOKED");
      await this.ports.captureLead(this.s);
      const when = `${relativeDay(utcToCenterLocal(new Date(res.startAt ?? startAt)).dateISO, this.ports.now, c, L)}, ${timeLabel(res.startAt ?? startAt, L)}`;
      this.say(c.bookConfirmed(this.s.name), {
        summary: {
          title: c.bookSummaryTitle,
          rows: [
            { label: c.summaryService, value: serviceName(svc, L) },
            { label: c.summaryWhen, value: when },
            { label: c.summaryPrice, value: formatSar(L, res.priceMinor ?? svc.priceMinor) },
            { label: c.summaryRef, value: (res.bookingId ?? "").slice(-8).toUpperCase() },
          ],
        },
        links: [{ label: c.viewBookings, href: `/${L}/account` }],
      });
      this.s.flow.slotAt = undefined;
      this.go("menu", [chip("faq", c.chip.questions), chip("whatsapp", c.chip.whatsapp), chip("restart", c.chip.restart)]);
      return;
    }
    switch (res.reason) {
      case "code": {
        const tries = (this.s.flow.otpTries ?? 0) + 1;
        this.s.flow.otpTries = tries;
        this.say(c.bookBadCode);
        this.go("book_otp", [chip("otp:resend", c.chip.resend, tries >= 3 ? "primary" : undefined), chip("otp:change", c.chip.changePhone)]);
        return;
      }
      case "taken":
        this.say(c.bookSlotTaken);
        if (this.s.flow.day) return this.pickDay(this.s.flow.day);
        return this.showDays();
      case "tier":
        this.say(c.bookTierDenied(res.tierName ?? ""));
        break;
      default:
        this.say(c.bookFailed);
    }
    this.go("menu", [chip("callback", c.chip.callMe, "primary"), chip("whatsapp", c.chip.whatsapp), chip("book", c.chip.bookAppointment)]);
  }

  // ---- Call-back ----

  startCallback(): Promise<void> | void {
    if (!this.s.name) {
      this.say(this.c.cbAskName);
      this.go("cb_name", []);
      return;
    }
    return this.cbAfterName();
  }

  cbAfterName(): void {
    if (!this.s.phone) {
      this.say(this.c.cbAskPhone);
      this.go("cb_phone", []);
      return;
    }
    this.askWindow();
  }

  askWindow(): void {
    const c = this.c;
    this.say(c.cbAskWindow(displayPhone(this.s.phone!)));
    this.go("cb_window", [...CALLBACK_WINDOWS.map((w) => chip(`win:${w}`, WINDOW_LABELS[w][this.s.locale], w === "asap" ? "primary" : undefined)), chip("otp:change", c.chip.changePhone)]);
  }

  async submitCallback(window: CallbackWindow): Promise<void> {
    const c = this.c;
    const res = await this.ports.requestCallback({ name: this.s.name!, phone: this.s.phone!, window, locale: this.s.locale, session: this.s });
    if (!res.ok) {
      this.say(c.cbFailed);
      this.go("menu", menuChips(this.s));
      return;
    }
    setOutcome(this.s, "CALLBACK");
    await this.ports.captureLead(this.s);
    this.say(c.cbDone(this.describeDue(res.dueAt ?? this.ports.now)));
    this.go("menu", menuChips(this.s).filter((x) => x.value !== "callback"));
  }

  describeDue(due: Date): string {
    const c = this.c;
    if (due.getTime() - this.ports.now.getTime() < 15 * 60_000) return c.cbWhenSoon;
    const local = utcToCenterLocal(due);
    const hh = String(Math.floor(local.minutes / 60)).padStart(2, "0");
    const mm = String(local.minutes % 60).padStart(2, "0");
    return c.cbWhenAt(relativeDay(local.dateISO, this.ports.now, c, this.s.locale), formatClock(`${hh}:${mm}`, this.s.locale));
  }

  // ---- WhatsApp ----

  whatsapp(): void {
    const c = this.c;
    const raw = this.ports.business?.whatsapp ?? "";
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length < 8 || /x/i.test(raw)) {
      this.say(c.waUnavailable);
      this.go("menu", menuChips(this.s).filter((x) => x.value !== "whatsapp"));
      return;
    }
    const L = this.s.locale;
    const p = this.s.profile;
    const lines = [c.waMessageIntro];
    if (p.concerns.length) lines.push(`${c.waConcerns}: ${p.concerns.map((k) => CONCERN_LABELS[k][L]).join(L === "ar" ? "، " : ", ")}`);
    if (p.event) lines.push(`${c.waGoal}: ${EVENT_LABELS[p.event][L]}`);
    else if (p.goals[0]) lines.push(`${c.waGoal}: ${GOAL_LABELS[p.goals[0]][L]}`);
    const recNames = this.s.recommendedServiceIds.map((id) => this.service(id)).filter((x): x is CatalogService => !!x).map((x) => serviceName(x, L));
    if (recNames.length) lines.push(`${c.waSuggested}: ${recNames.join(L === "ar" ? "، " : ", ")}`);
    const href = `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
    setOutcome(this.s, "WHATSAPP");
    this.say(c.waOpen, { links: [{ label: c.waButton, href, external: true }] });
    this.go("menu", menuChips(this.s).filter((x) => x.value !== "whatsapp"));
  }

  // ---- FAQ ----

  answerFaq(topic: string): void {
    const c = this.c;
    const L = this.s.locale;
    const hours = this.ports.hours;
    const business = this.ports.business;
    switch (topic) {
      case "hours": {
        if (!hours) return this.say(c.faqHoursUnknown);
        const state = openState(hours, this.ports.now);
        const status = state.open
          ? c.faqHoursOpen(formatClock(state.closesAt!, L))
          : state.nextOpen
            ? c.faqHoursClosed(
                `${state.nextOpen.daysAhead === 0 ? c.today : state.nextOpen.daysAhead === 1 ? c.tomorrow : dayName(state.nextOpen.dayKey, L)} ${formatClock(state.nextOpen.time, L)}`,
              )
            : c.faqHoursUnknown;
        this.say(`${status}\n${c.faqHoursWeek(weekLines(hours, L, c))}`);
        return;
      }
      case "location": {
        const address = business ? (L === "ar" ? business.addressAr : business.addressEn) : "";
        const links = address ? [{ label: c.faqLocationLink, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Lunia ${business?.addressEn ?? address}`)}`, external: true }] : [];
        this.say(c.faqLocation(address || (L === "ar" ? "الرياض" : "Riyadh")), { links });
        return;
      }
      case "prices": {
        const byDept = new Map<string, CatalogService>();
        for (const svc of this.ports.catalog) {
          const cur = byDept.get(svc.departmentSlug);
          if (!cur || svc.priceMinor < cur.priceMinor) byDept.set(svc.departmentSlug, svc);
        }
        const recs = this.s.recommendedServiceIds.map((id) => this.service(id)).filter((x): x is CatalogService => !!x);
        const list = recs.length ? recs : [...byDept.values()];
        const lines = list.map((svc) => `- ${serviceName(svc, L)}: ${formatSar(L, svc.priceMinor)}`).join("\n");
        this.say(c.faqPrices(lines));
        return;
      }
      case "giftcards":
        this.say(c.faqGiftCards, { links: [{ label: c.faqGiftCardsLink, href: `/${L}/gift-cards` }] });
        return;
      case "payment":
        this.say(c.faqPayment);
        return;
      case "parking": {
        const address = business?.addressEn;
        const links = address ? [{ label: c.faqLocationLink, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Lunia ${address}`)}`, external: true }] : [];
        this.say(c.faqParking, { links });
        return;
      }
      case "duration": {
        const recs = this.s.recommendedServiceIds.map((id) => this.service(id)).filter((x): x is CatalogService => !!x);
        const pool = recs.length ? recs : this.ports.catalog;
        const mins = pool.map((x) => x.durationMin);
        if (mins.length === 0) return this.say(c.faqDuration(c.minutesRange(30, 60)));
        const lo = Math.min(...mins);
        const hi = Math.max(...mins);
        this.say(c.faqDuration(lo === hi ? c.durationLabel(lo) : c.minutesRange(lo, hi)));
        return;
      }
    }
  }

  openFaqMenu(): void {
    if (this.s.state !== "faq_menu") this.s.flow.returnTo = this.s.state;
    this.say(this.c.faqPrompt);
    this.go("faq_menu", faqChips(this.s));
  }

  /** After an FAQ answer: stay in the FAQ menu, or go back to the question. */
  afterFaq(): void {
    if (this.s.state === "faq_menu") {
      this.go("faq_menu", faqChips(this.s));
      return;
    }
    if (this.s.state.startsWith("ask_")) return this.repromptCurrent();
    // Mid-booking / call-back: keep the step (chips unchanged).
    if (this.s.state.startsWith("book_") || this.s.state.startsWith("cb_")) return;
    this.go(this.s.state === "recommend" ? "recommend" : "menu", this.s.state === "recommend" ? this.s.flow.chips : menuChips(this.s));
  }

  goBack(): void {
    const target = this.s.flow.returnTo;
    this.s.flow.returnTo = undefined;
    if (target && target.startsWith("ask_")) {
      this.s.state = target;
      return this.repromptCurrent();
    }
    if (target === "recommend" && this.s.recommendedServiceIds.length) return this.recommend();
    this.say(this.c.recWhatNext);
    this.go("menu", menuChips(this.s));
  }

  restart(): void {
    this.s.profile = emptyProfile();
    this.s.flow = { asked: ["concern"], misses: 0, chips: [], input: "text" };
    this.s.recommendedServiceIds = [];
    this.say(this.c.restarted);
    this.go("ask_concern", concernChips(this.s));
  }
}

// Week summary starting Saturday (the Saudi week), grouping equal days.
function weekLines(hours: HoursSettings, locale: Locale, c: Copy): string {
  const order = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const;
  const describe = (k: (typeof order)[number]) => {
    const d = hours[k];
    return d.closed ? c.closedLabel : `${formatClock(d.open, locale)} - ${formatClock(d.close, locale)}`;
  };
  const groups: { from: string; to: string; text: string }[] = [];
  for (const k of order) {
    const text = describe(k);
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.to = k;
    else groups.push({ from: k, to: k, text });
  }
  return groups
    .map((g) => `${dayName(g.from, locale)}${g.from !== g.to ? ` - ${dayName(g.to, locale)}` : ""}: ${g.text}`)
    .join("\n");
}

const FAQ_INTENTS: Record<string, string> = {
  faq_hours: "hours",
  faq_location: "location",
  faq_price: "prices",
  faq_giftcard: "giftcards",
  faq_payment: "payment",
  faq_parking: "parking",
  faq_duration: "duration",
};

function applyChoiceToProfile(s: Session, key: string, arg: string): boolean {
  const p = s.profile;
  switch (key) {
    case "concern":
      if ((CONCERNS as readonly string[]).includes(arg) && !p.concerns.includes(arg as Concern)) p.concerns.push(arg as Concern);
      if (arg === "other") p.notes.push("concern: something else");
      inferAreas(p);
      return true;
    case "dur": {
      const months = { short: 2, mid: 6, long: 18, years: 36 }[arg];
      if (months === undefined) return false;
      p.durationMonths = months;
      return true;
    }
    case "ps": {
      const months = { recent: 0.3, mid: 1, long: 2.5 }[arg];
      if (months === undefined) return false;
      p.durationMonths = months;
      p.durationText = `procedure ${arg === "recent" ? "under 2 weeks" : arg === "mid" ? "2-6 weeks" : "over 6 weeks"} ago`;
      return true;
    }
    case "tried":
      if (arg === "none") p.triedText = "none";
      else if (arg === "home") p.previousTreatments.includes("home_products") || p.previousTreatments.push("home_products");
      else if (arg === "clinic") p.previousTreatments.includes("clinic_treatments") || p.previousTreatments.push("clinic_treatments");
      else return false;
      return true;
    case "goal":
      if (arg === "event") {
        p.event ??= "party";
        return true;
      }
      if (!(GOALS as readonly string[]).includes(arg)) return false;
      if (!p.goals.includes(arg as (typeof GOALS)[number])) p.goals.push(arg as (typeof GOALS)[number]);
      return true;
    case "when": {
      const weeks = { "2w": 2, "6w": 6, later: 12 }[arg];
      if (weeks === undefined) return false;
      p.timelineWeeks = weeks;
      return true;
    }
    case "skin":
      if (arg === "unsure") return true;
      if (!(SKIN_TYPES as readonly string[]).includes(arg)) return false;
      p.skinType = arg as (typeof SKIN_TYPES)[number];
      return true;
    case "safety":
      p.safetyAnswered = true;
      if (arg === "none") return true;
      if (arg === "pregnant") {
        if (!p.contraindications.includes("pregnant")) p.contraindications.push("pregnant");
        return true;
      }
      if (!(CONTRAINDICATIONS as readonly string[]).includes(arg)) return false;
      if (!p.contraindications.includes(arg as (typeof CONTRAINDICATIONS)[number])) p.contraindications.push(arg as (typeof CONTRAINDICATIONS)[number]);
      return true;
  }
  return false;
}

/** Commands that are valid from any state, even if not currently shown. */
const GLOBAL_CHOICES = new Set(["restart", "book", "callback", "whatsapp", "faq", "menu", "consult", "recs", "back"]);

async function handleChoice(turn: Turn, value: string): Promise<void> {
  const s = turn.s;
  const [key, ...rest] = value.split(":");
  const arg = rest.join(":");

  if (value.startsWith("faq:")) {
    turn.answerFaq(arg);
    return turn.afterFaq();
  }

  switch (key) {
    case "restart":
      return turn.restart();
    case "book":
      return turn.startBooking(arg || undefined);
    case "svc": {
      const svc = turn.service(arg);
      if (!svc) return turn.startBooking();
      return turn.chooseService(svc);
    }
    case "callback":
      return turn.startCallback();
    case "whatsapp":
      return turn.whatsapp();
    case "faq":
      return turn.openFaqMenu();
    case "back":
      return turn.goBack();
    case "menu":
      turn.say(turn.c.recWhatNext);
      return turn.go("menu", menuChips(s));
    case "consult":
      s.flow.asked = [];
      return turn.continueIntake();
    case "recs":
      return turn.recommend();
    case "days":
      if (arg === "more") s.flow.dayPage = 1;
      else if (arg === "less") s.flow.dayPage = 0;
      return turn.showDays();
    case "day":
      if (!turn.dayOptions().includes(arg)) return turn.showDays();
      return turn.pickDay(arg);
    case "slot":
      if (!s.flow.slots?.includes(arg)) return turn.showDays();
      return turn.pickSlot(arg);
    case "otp":
      if (arg === "resend" && s.phone) return turn.sendCode();
      s.phone = undefined;
      if (s.state === "cb_window") {
        turn.say(turn.c.cbAskPhone);
        return turn.go("cb_phone", []);
      }
      turn.say(turn.c.bookAskPhone);
      return turn.go("book_phone", []);
    case "win":
      if ((CALLBACK_WINDOWS as readonly string[]).includes(arg) && s.name && s.phone) return turn.submitCallback(arg as CallbackWindow);
      return turn.startCallback();
    case "skip":
      return advanceIntake(turn);
  }

  if (applyChoiceToProfile(s, key!, arg)) {
    if (key === "goal" && arg === "event" && s.profile.timelineWeeks === undefined) {
      turn.say(turn.c.askWhen);
      return turn.go("ask_when", [chip("when:2w", turn.c.chip.when2w), chip("when:6w", turn.c.chip.when6w), chip("when:later", turn.c.chip.whenLater), chip("skip", turn.c.chip.skip)]);
    }
    if (key === "concern" && s.profile.concerns.length > 0) turn.say(turn.c.askConcernAck(listConcerns(s.profile.concerns, s.locale)));
    return advanceIntake(turn);
  }
  turn.say(turn.c.notUnderstood);
}

function advanceIntake(turn: Turn): Promise<void> {
  const s = turn.s;
  // Mark the current question as asked so a skip moves past it.
  const q = (Object.keys(QUESTION_STATE) as Question[]).find((k) => QUESTION_STATE[k] === s.state);
  if (q && !s.flow.asked.includes(q)) s.flow.asked.push(q);
  if (!s.state.startsWith("ask_")) return Promise.resolve(turn.recommend());
  return turn.continueIntake();
}

const ACTION_INTENTS = ["book", "callback", "human", "whatsapp"] as const;

async function handleText(turn: Turn, text: string): Promise<void> {
  const s = turn.s;
  const u = await turn.ports.nlu.understand(text, { expecting: expectingFor(s.state) });

  // Contact details are captured whenever they appear.
  const hadPhone = !!s.phone;
  if (u.name && !s.name && s.state !== "book_otp") s.name = u.name;
  if (u.phone && (!s.phone || s.state === "book_phone" || s.state === "cb_phone")) s.phone = u.phone;
  if (s.phone && !hadPhone) {
    setOutcome(s, "LEAD");
    await turn.ports.captureLead(s);
  }

  // 1) Steps that expect a specific kind of input.
  switch (s.state) {
    case "book_name":
    case "cb_name": {
      const name = u.name ?? cleanPersonName(text);
      if (!name) {
        if (u.intents.some((i) => i.startsWith("faq_"))) break;
        turn.say(turn.c.bookBadName);
        return;
      }
      s.name = name;
      return s.state === "book_name" ? turn.afterName() : turn.cbAfterName();
    }
    case "book_phone":
    case "cb_phone": {
      const phone = u.phone ?? normalizePhone(text);
      if (!phone) {
        if (u.intents.some((i) => i.startsWith("faq_"))) break;
        turn.say(turn.c.bookBadPhone);
        return;
      }
      if (!s.phone || s.phone !== phone) {
        s.phone = phone;
        setOutcome(s, "LEAD");
        await turn.ports.captureLead(s);
      }
      return s.state === "book_phone" ? turn.sendCode() : turn.askWindow();
    }
    case "book_otp": {
      if (u.code) return turn.confirmCode(u.code);
      if (u.intents.some((i) => i.startsWith("faq_"))) break;
      turn.say(turn.c.bookCodeFormat);
      return;
    }
  }

  if (u.intents.includes("restart")) return turn.restart();

  const learned = mergeIntoProfile(s.profile, u);

  // 2) Questions are answered wherever they're asked.
  const faqs = u.intents.filter((i) => i in FAQ_INTENTS).slice(0, 2);
  for (const f of faqs) turn.answerFaq(FAQ_INTENTS[f]!);

  // 3) Explicit actions, when the message is mostly about the action.
  const short = text.trim().split(/\s+/).length <= 7;
  const action = ACTION_INTENTS.find((i) => u.intents.includes(i));
  if (action && (short || !learned)) {
    if (action === "book") return turn.startBooking();
    if (action === "whatsapp") return turn.whatsapp();
    return turn.startCallback();
  }
  if (faqs.length > 0 && !learned) return turn.afterFaq();

  if (u.intents.includes("recommend") && s.state.startsWith("ask_")) return turn.recommend();

  // 4) Intake: the message answers (or adds to) the current question.
  if (s.state.startsWith("ask_")) {
    const q = (Object.keys(QUESTION_STATE) as Question[]).find((k) => QUESTION_STATE[k] === s.state);
    if (u.intents.includes("skip")) return advanceIntake(turn);
    if (s.state === "ask_concern" && s.profile.concerns.length === 0) {
      if (!learned && (u.intents.includes("greeting") || u.intents.includes("thanks"))) {
        turn.say(turn.c.helloAgain);
        return turn.repromptCurrent();
      }
      // Couldn't place it: keep the words for the specialist, ask once more.
      if (text.trim()) s.profile.notes.push(text.trim().slice(0, 300));
      s.flow.misses += 1;
      if (s.flow.misses < 2) {
        turn.say(turn.c.concernRetry);
        return turn.go("ask_concern", concernChips(s));
      }
      return advanceIntake(turn);
    }
    if (!learned) {
      // Free-text answer we can't classify: store it against the question.
      const clean = text.trim().slice(0, 300);
      if (q === "duration") s.profile.durationText = clean;
      else if (q === "tried") s.profile.triedText = clean;
      else if (s.state === "ask_goal" || s.state === "ask_when") s.profile.timelineText = clean;
      else if (q === "safety") {
        if (u.intents.includes("no")) s.profile.safetyAnswered = true;
        else s.profile.notes.push(`safety: ${clean}`);
        s.profile.safetyAnswered = true;
      } else if (clean) s.profile.notes.push(clean);
    }
    if (s.state === "ask_concern" && s.profile.concerns.length > 0) turn.say(turn.c.askConcernAck(listConcerns(s.profile.concerns, s.locale)));
    return advanceIntake(turn);
  }

  // 5) Anywhere else.
  if (learned && (s.state === "recommend" || s.state === "menu") && s.profile.concerns.length > 0) return turn.recommend(true);
  if (u.intents.includes("thanks")) {
    turn.say(turn.c.thanks);
    return turn.go("menu", menuChips(s));
  }
  if (u.intents.includes("greeting")) {
    turn.say(turn.c.helloAgain);
    return turn.go(s.state, s.flow.chips.length ? s.flow.chips : menuChips(s));
  }
  if (s.state.startsWith("book_") || s.state.startsWith("cb_")) {
    turn.say(turn.c.notUnderstood);
    return;
  }
  if (learned && s.profile.concerns.length > 0) return turn.recommend(true);
  turn.say(turn.c.notUnderstood);
  turn.go(s.state === "faq_menu" ? "faq_menu" : "menu", s.state === "faq_menu" ? faqChips(s) : menuChips(s));
}

/** Runs one visitor input through the machine. */
export async function advance(session: Session, input: Input, ports: AssistantPorts): Promise<AdvanceResult> {
  const s: Session = structuredClone(session);
  const turn = new Turn(s, ports);
  let userText: string;

  if (input.kind === "choice") {
    const shown = s.flow.chips.find((x) => x.value === input.value);
    const [key] = input.value.split(":");
    const allowed = !!shown || GLOBAL_CHOICES.has(key!) || input.value.startsWith("faq:") || input.value.startsWith("book:");
    userText = shown?.label ?? input.value;
    if (!allowed) {
      // A stale chip (e.g. from an older screen): ignore it gracefully.
      turn.say(turn.c.notUnderstood);
      return { session: s, userText, replies: turn.replies };
    }
    if (!shown) userText = globalChipLabel(input.value, turn.c) ?? input.value;
    await handleChoice(turn, input.value);
  } else {
    userText = input.text;
    await handleText(turn, input.text);
  }

  if (turn.replies.length === 0) turn.say(turn.c.notUnderstood);
  return { session: s, userText, replies: turn.replies };
}

function globalChipLabel(value: string, c: Copy): string | null {
  const map: Record<string, string> = {
    restart: c.chip.restart,
    book: c.chip.bookAppointment,
    callback: c.chip.callMe,
    whatsapp: c.chip.whatsapp,
    faq: c.chip.questions,
    consult: c.chip.consult,
    recs: c.chip.recs,
    back: c.chip.back,
  };
  return map[value.split(":")[0]!] ?? null;
}

export function placeholderFor(session: Session): string {
  return copy(session.locale).placeholder[session.flow.input];
}
