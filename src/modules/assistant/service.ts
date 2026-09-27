// Server side of the website assistant: loads/persists the ChatSession, wires
// the state machine's ports to the real booking, OTP, call-back and CRM
// modules, applies the abuse guard, and turns the session into the view the
// widget renders. The widget itself holds no logic.

import { randomBytes } from "crypto";
import type { ChatSession, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSetting } from "@/modules/cms/settings";
import { getServiceSlots, createBooking } from "@/modules/booking/bookings";
import { getTierGateNotesForServices } from "@/modules/booking/accessRules";
import { requestOtp, verifyOtp, createClientSession } from "@/modules/iam/clientAuth";
import { copy, type Locale } from "./copy";
import { advance, greeting, newSession, placeholderFor, type AssistantPorts, type BookResult, type Flow, type Input, type Reply, type Session, type StateName } from "./machine";
import { getNluEngine } from "./nlu/engine";
import { captureChatLead, CHAT_SOURCE_CHANNEL } from "./leads";
import { createCallbackRequest } from "./callbacks";
import { phoneVariants } from "./phone";
import { sanitizeInput } from "./normalize";
import { allowMessage, allowNewSession, MAX_MESSAGE_LENGTH } from "./throttle";
import type { CatalogService } from "./recommend";
import { emptyProfile, type ChatMessageView, type ChatView, type ConsultProfile } from "./types";

export const CHAT_COOKIE = "lunia_chat";
export const CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
/** Older conversations start fresh rather than resuming mid-flow. */
const RESUME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_TRANSCRIPT = 400;

export interface TranscriptEntry extends Omit<ChatMessageView, "id"> {
  at: string;
  step?: string;
}

interface StoredProfile extends ConsultProfile {
  _flow?: Flow;
  _meta?: { notedOutcome?: string };
}

export interface ChatContext {
  token: string | null;
  locale: Locale;
  ip: string;
  /** Signs the visitor in after a verified OTP (sets the client cookie). */
  onClientSignedIn?: (sessionToken: string) => Promise<void>;
}

export interface ChatResult {
  view: ChatView;
  /** Set when a new chat session was created (the caller sets the cookie). */
  newToken?: string;
}

// --- Catalog ------------------------------------------------------------

export async function loadCatalog(): Promise<CatalogService[]> {
  const services = await prisma.service.findMany({
    where: { isPublished: true, department: { isPublished: true } },
    include: { department: true },
    orderBy: [{ department: { order: "asc" } }, { order: "asc" }],
  });
  const tiers = await getTierGateNotesForServices(services.map((s) => s.id));
  return services.map((s) => ({
    id: s.id,
    slug: s.slug,
    nameEn: s.nameEn,
    nameAr: s.nameAr,
    summaryEn: s.summaryEn,
    summaryAr: s.summaryAr,
    departmentSlug: s.department.slug,
    durationMin: s.durationMin,
    priceMinor: s.priceMinor,
    onlineBookable: s.onlineBookable,
    inCenterOnly: s.inCenterOnly,
    tierName: tiers[s.id] ?? null,
  }));
}

// --- Row <-> session ----------------------------------------------------

function rowToSession(row: ChatSession, locale: Locale): Session {
  const stored = (row.profile ?? {}) as unknown as StoredProfile;
  const { _flow, _meta: _ignored, ...facts } = stored;
  void _ignored;
  const base = newSession(locale);
  return {
    state: (row.state === "start" ? "ask_concern" : row.state) as StateName,
    locale,
    profile: { ...emptyProfile(), ...facts },
    flow: _flow ?? base.flow,
    name: row.name ?? undefined,
    phone: row.phone ?? undefined,
    outcome: (row.outcome as Session["outcome"]) ?? undefined,
    bookingId: row.bookingId ?? undefined,
    recommendedServiceIds: row.recommendedServiceIds,
  };
}

function transcriptOf(row: ChatSession | null): TranscriptEntry[] {
  return Array.isArray(row?.transcript) ? (row.transcript as unknown as TranscriptEntry[]) : [];
}

function viewOf(transcript: TranscriptEntry[], session: Session, notice?: string): ChatView {
  const messages: ChatMessageView[] = transcript.map((t, i) => ({
    id: String(i),
    from: t.from,
    text: t.text,
    ...(t.cards ? { cards: t.cards } : {}),
    ...(t.links ? { links: t.links } : {}),
    ...(t.summary ? { summary: t.summary } : {}),
  }));
  if (notice) messages.push({ id: `n${messages.length}`, from: "bot", text: notice });
  return { messages, ui: { chips: session.flow.chips, input: session.flow.input, placeholder: placeholderFor(session) } };
}

function botEntries(replies: Reply[], step: string, at: string): TranscriptEntry[] {
  return replies.map((r) => ({ from: "bot" as const, at, step, ...r }));
}

async function findActiveRow(token: string | null): Promise<ChatSession | null> {
  if (!token || !/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const row = await prisma.chatSession.findUnique({ where: { token } });
  if (!row || Date.now() - row.updatedAt.getTime() > RESUME_WINDOW_MS) return null;
  return row;
}

// --- Public API ---------------------------------------------------------

/** Current conversation for the widget (a fresh greeting if none yet). */
export async function openChat(ctx: ChatContext): Promise<ChatResult> {
  const row = await findActiveRow(ctx.token);
  if (!row) {
    const session = newSession(ctx.locale);
    return { view: viewOf([{ from: "bot", at: new Date().toISOString(), ...greeting(ctx.locale) }], session) };
  }
  const session = rowToSession(row, ctx.locale);
  return { view: viewOf(transcriptOf(row), session) };
}

const CHOICE_RE = /^[a-z_]{2,20}(?::[A-Za-z0-9_.:-]{1,64})?$/;

export async function sendChat(ctx: ChatContext, rawInput: Input): Promise<ChatResult> {
  const c = copy(ctx.locale);
  let row = await findActiveRow(ctx.token);
  const current = () => (row ? viewOf(transcriptOf(row), rowToSession(row, ctx.locale)) : null);
  const withNotice = async (notice: string): Promise<ChatResult> => {
    const view = current() ?? (await openChat(ctx)).view;
    view.messages.push({ id: `n${view.messages.length}`, from: "bot", text: notice });
    return { view };
  };

  // Validate the input shape before anything else.
  let input: Input;
  if (rawInput.kind === "choice") {
    if (typeof rawInput.value !== "string" || !CHOICE_RE.test(rawInput.value)) return withNotice(c.notUnderstood);
    input = rawInput;
  } else {
    if (typeof rawInput.text !== "string") return withNotice(c.notUnderstood);
    if (rawInput.text.length > MAX_MESSAGE_LENGTH * 2) return withNotice(c.tooLong);
    const text = sanitizeInput(rawInput.text, MAX_MESSAGE_LENGTH + 1);
    if (!text) return withNotice(c.notUnderstood);
    if (text.length > MAX_MESSAGE_LENGTH) return withNotice(c.tooLong);
    input = { kind: "text", text };
  }

  if (!(await allowMessage(row?.token ?? null, ctx.ip))) return withNotice(c.rateLimited);

  let newToken: string | undefined;
  if (!row) {
    if (!(await allowNewSession(ctx.ip))) return withNotice(c.rateLimited);
    newToken = randomBytes(24).toString("base64url");
    const fresh = newSession(ctx.locale);
    row = await prisma.chatSession.create({
      data: {
        token: newToken,
        locale: ctx.locale,
        state: fresh.state,
        profile: { ...fresh.profile, _flow: fresh.flow } as unknown as Prisma.InputJsonValue,
        transcript: [{ from: "bot", at: new Date().toISOString(), step: "greeting", ...greeting(ctx.locale) }] as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const session = rowToSession(row, ctx.locale);
  const meta = { ...(((row.profile ?? {}) as unknown as StoredProfile)._meta ?? {}) };
  const tracked = { clientProfileId: row.clientProfileId };
  const catalog = await loadCatalog();
  const ports = await buildPorts(ctx, row.id, catalog, tracked, meta);

  let result: { session: Session; userText: string; replies: Reply[] };
  try {
    result = await advance(session, input, ports);
  } catch (err) {
    console.error("[assistant] turn failed", err);
    result = { session, userText: input.kind === "text" ? input.text : input.value, replies: [{ text: c.genericError }] };
  }

  const at = new Date().toISOString();
  const transcript = [
    ...transcriptOf(row),
    { from: "user" as const, at, step: session.state, text: result.userText },
    ...botEntries(result.replies, result.session.state, at),
  ].slice(-MAX_TRANSCRIPT);

  const s = result.session;
  const saved = await prisma.chatSession.update({
    where: { id: row.id },
    data: {
      locale: ctx.locale,
      state: s.state,
      profile: { ...s.profile, _flow: s.flow, _meta: meta } as unknown as Prisma.InputJsonValue,
      transcript: transcript as unknown as Prisma.InputJsonValue,
      name: s.name ?? null,
      phone: s.phone ?? null,
      outcome: s.outcome ?? null,
      bookingId: s.bookingId ?? null,
      recommendedServiceIds: s.recommendedServiceIds,
      clientProfileId: tracked.clientProfileId,
    },
  });
  return { view: viewOf(transcriptOf(saved), s), newToken };
}

/** Starts a new conversation (the old one stays for the admin history). */
export async function resetChat(ctx: ChatContext): Promise<ChatResult> {
  return openChat({ ...ctx, token: null });
}

// --- Ports --------------------------------------------------------------

// The booking wizard stores phones as typed; reuse an existing spelling so an
// OTP or booking lands on the same customer instead of creating a duplicate.
async function storedPhone(e164: string): Promise<string> {
  const user = await prisma.user.findFirst({ where: { phone: { in: phoneVariants(e164) } }, select: { phone: true } });
  return user?.phone ?? e164;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function buildPorts(
  ctx: ChatContext,
  chatSessionId: string,
  catalog: CatalogService[],
  tracked: { clientProfileId: string | null },
  meta: { notedOutcome?: string },
): Promise<AssistantPorts> {
  const [hours, business, nlu] = await Promise.all([
    getSetting("hours").catch(() => null),
    getSetting("business").catch(() => null),
    getNluEngine(),
  ]);
  const recommendedNames = (s: Session) =>
    s.recommendedServiceIds.map((id) => catalog.find((x) => x.id === id)?.nameEn).filter((x): x is string => !!x);

  const captureLead = async (s: Session) => {
    if (!s.phone) return;
    const res = await captureChatLead({
      clientProfileId: tracked.clientProfileId,
      phone: s.phone,
      name: s.name,
      profile: s.profile,
      recommended: recommendedNames(s),
      outcome: s.outcome ?? "LEAD",
      notedOutcome: meta.notedOutcome,
    });
    tracked.clientProfileId = res.clientProfileId;
    meta.notedOutcome = res.notedOutcome;
  };

  return {
    now: new Date(),
    catalog,
    hours,
    business,
    nlu,
    async getSlots(serviceId, dateISO) {
      try {
        const slots = await getServiceSlots(serviceId, dateISO);
        return [...new Set(slots.map((x) => x.startAt.toISOString()))].sort();
      } catch {
        return [];
      }
    },
    async sendOtp(phone, locale) {
      try {
        const res = await requestOtp(await storedPhone(phone), { locale });
        return { ok: true, devCode: res.devCode };
      } catch (err) {
        const m = messageOf(err);
        if (m.includes("Invalid phone")) return { ok: false, reason: "invalid" };
        if (m.includes("Too many")) return { ok: false, reason: "rate" };
        return { ok: false, reason: "error" };
      }
    },
    async book({ serviceId, startAt, name, phone, code, locale }): Promise<BookResult> {
      try {
        const identifier = await storedPhone(phone);
        const verified = await verifyOtp(identifier, code, { sourceChannel: CHAT_SOURCE_CHANNEL, name });
        if (!verified) return { ok: false, reason: "code" };
        if (ctx.onClientSignedIn) await ctx.onClientSignedIn(await createClientSession(verified.userId));
        const booking = await createBooking({
          serviceId,
          startAt,
          client: { name, phone: identifier },
          channel: "ONLINE",
          sourceChannel: CHAT_SOURCE_CHANNEL,
          notes: "Booked through the website assistant.",
          locale,
        });
        const appt = booking.appointments[0];
        tracked.clientProfileId ??= booking.clientProfileId;
        return { ok: true, bookingId: booking.id, startAt: appt?.startAt.toISOString(), priceMinor: appt?.priceMinorSnapshot };
      } catch (err) {
        const m = messageOf(err);
        if (m.includes("no longer available") || m.includes("just taken") || m.includes("in the past")) return { ok: false, reason: "taken" };
        const tier = /available to (.+) members/i.exec(m);
        if (tier) return { ok: false, reason: "tier", tierName: tier[1] };
        if (m.includes("not available for online booking") || m.includes("not currently available")) return { ok: false, reason: "unavailable" };
        console.error("[assistant] booking failed", err);
        return { ok: false, reason: "error" };
      }
    },
    async requestCallback({ name, phone, window, locale, session }) {
      try {
        await captureLead(session);
        const row = await createCallbackRequest({
          name,
          phone,
          locale,
          preferredWindow: window,
          topic: session.profile.concerns.length ? session.profile.concerns.join(", ") : undefined,
          source: "CHAT",
          chatSessionId,
          clientProfileId: tracked.clientProfileId ?? undefined,
        });
        return { ok: true, dueAt: row.dueAt ?? undefined };
      } catch (err) {
        console.error("[assistant] call-back failed", err);
        return { ok: false };
      }
    },
    async captureLead(s) {
      try {
        await captureLead(s);
      } catch (err) {
        // Lead capture must never break the conversation.
        console.error("[assistant] lead capture failed", err);
      }
    },
  };
}
