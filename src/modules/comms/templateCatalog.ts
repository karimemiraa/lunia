// Client-safe catalogue for the admin Template Studio: kind/channel labels,
// the placeholder tokens each kind exposes, sensible bilingual DEFAULT bodies
// (native Gulf-Arabic + English) for combos that have no MessageTemplate row
// yet, sample values for the live preview, and pure interpolate/subject
// helpers. Deliberately imports NOTHING server-only (no prisma) so both the
// server page and the "use client" studio can import it. The real send path
// still lives in modules/comms/templates.ts + booking/outbox.ts.

export const TEMPLATE_KINDS = [
  "CONFIRMATION",
  "REMINDER_24H",
  "POST_VISIT",
  "OTP",
  "WAITLIST_OPEN",
  "REVIEW_REQUEST",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_LOCALES = ["ar", "en"] as const;
export const TEMPLATE_CHANNELS = ["email", "whatsapp", "sms"] as const;

export const KIND_META: Record<string, { label: string; description: string; placeholders: string[] }> = {
  CONFIRMATION: {
    label: "Booking confirmation",
    description: "Sent right after a booking is made.",
    placeholders: ["serviceName", "dateTime", "bookingId"],
  },
  REMINDER_24H: {
    label: "Appointment reminder (24h)",
    description: "Sent the day before the appointment.",
    placeholders: ["serviceName", "dateTime", "bookingId"],
  },
  POST_VISIT: {
    label: "Post-visit thank-you",
    description: "Sent after the visit is completed.",
    placeholders: ["serviceName", "dateTime", "bookingId"],
  },
  OTP: {
    label: "Login code (OTP)",
    description: "One-time verification code for sign-in.",
    placeholders: ["code"],
  },
  WAITLIST_OPEN: {
    label: "Waitlist spot opened",
    description: "Sent when a waited-for slot frees up.",
    placeholders: ["serviceName"],
  },
  REVIEW_REQUEST: {
    label: "Review request",
    description: "Invites the customer to leave a review.",
    placeholders: ["serviceName", "link"],
  },
};

export const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

export const LOCALE_LABELS: Record<string, string> = {
  ar: "العربية",
  en: "English",
};

// Bilingual default bodies (native Gulf-Saudi Arabic — warm, correct, not a
// literal translation of the English). Used when no MessageTemplate row
// exists yet so the studio never shows an empty editor, and as the seed the
// admin edits from.
export const DEFAULT_BODIES: Record<string, { ar: string; en: string }> = {
  CONFIRMATION: {
    ar: "تم تأكيد حجزك في لونيا لخدمة {{serviceName}} بتاريخ {{dateTime}}.\n\nرقم الحجز: {{bookingId}}\n\nنتشرّف بزيارتك ونتطلّع للقائك قريباً.",
    en: "Your Lunia booking for {{serviceName}} is confirmed for {{dateTime}}.\n\nBooking reference: {{bookingId}}\n\nWe look forward to welcoming you.",
  },
  REMINDER_24H: {
    ar: "تذكير ودّي: موعدك في لونيا لخدمة {{serviceName}} غداً {{dateTime}}.\n\nرقم الحجز: {{bookingId}}\n\nإذا رغبت بتعديل الموعد، تواصل معنا وبكل سرور.",
    en: "A friendly reminder: your Lunia appointment for {{serviceName}} is tomorrow, {{dateTime}}.\n\nBooking reference: {{bookingId}}\n\nLet us know if you'd like to reschedule.",
  },
  POST_VISIT: {
    ar: "شكراً لزيارتك لونيا لخدمة {{serviceName}}.\n\nنتمنّى أن تكون تجربتك مميّزة، ويسعدنا رؤيتك من جديد.",
    en: "Thank you for visiting Lunia for your {{serviceName}}.\n\nWe hope you had a wonderful experience and can't wait to welcome you back.",
  },
  OTP: {
    ar: "رمز الدخول إلى لونيا هو {{code}}\n\nصالح لمدة ٥ دقائق. لا تشارك هذا الرمز مع أحد.",
    en: "Your Lunia verification code is {{code}}\n\nIt is valid for 5 minutes. Please don't share it with anyone.",
  },
  WAITLIST_OPEN: {
    ar: "بشرى سارّة! تم فتح موعد في لونيا لخدمة {{serviceName}} كنت بانتظاره.\n\nسارع بالحجز قبل أن يُحجز.",
    en: "Good news! A spot just opened at Lunia for {{serviceName}}.\n\nBook now before it's taken.",
  },
  REVIEW_REQUEST: {
    ar: "شكراً لزيارتك لونيا لخدمة {{serviceName}}.\n\nيسعدنا سماع رأيك عن تجربتك:\n{{link}}",
    en: "Thank you for visiting Lunia for your {{serviceName}}.\n\nWe'd love to hear about your experience:\n{{link}}",
  },
};

export function defaultBody(kind: string, locale: string): string {
  const entry = DEFAULT_BODIES[kind];
  if (!entry) return "";
  return locale.toLowerCase().startsWith("ar") ? entry.ar : entry.en;
}

// A short, human subject line per kind + locale (mirrors outbox.subjectForKind).
export function subjectForTemplate(kind: string, locale: string): string {
  const isAr = locale.toLowerCase().startsWith("ar");
  switch (kind) {
    case "OTP":
      return isAr ? "رمز الدخول إلى لونيا" : "Your Lunia code";
    case "CONFIRMATION":
      return isAr ? "تأكيد حجزك في لونيا" : "Your Lunia booking is confirmed";
    case "REMINDER_24H":
      return isAr ? "تذكير بموعدك في لونيا" : "Your Lunia appointment reminder";
    case "POST_VISIT":
      return isAr ? "شكراً لزيارتك لونيا" : "Thank you for visiting Lunia";
    case "WAITLIST_OPEN":
      return isAr ? "فتح موعد كنت بانتظاره في لونيا" : "A spot opened up at Lunia";
    case "REVIEW_REQUEST":
      return isAr ? "شاركنا رأيك في زيارتك لونيا" : "Share your Lunia experience";
    default:
      return "Lunia";
  }
}

// Realistic sample values so the preview reads like a real message.
export function sampleParams(locale: string): Record<string, string> {
  const isAr = locale.toLowerCase().startsWith("ar");
  return isAr
    ? {
        serviceName: "جلسة نضارة الوجه",
        dateTime: "الأحد ٢٢ سبتمبر، ٤:٠٠ مساءً",
        bookingId: "LUN-4821",
        code: "482913",
        link: "https://lunia.sa/r/az8y",
      }
    : {
        serviceName: "Radiance Facial",
        dateTime: "Sunday, Sep 22 at 4:00 PM",
        bookingId: "LUN-4821",
        code: "482913",
        link: "https://lunia.sa/r/az8y",
      };
}

export function sampleRecipientName(locale: string): string {
  return locale.toLowerCase().startsWith("ar") ? "نورة" : "Sarah";
}

// Replaces every {{token}} with params[token] ("" for unknown tokens) — the
// same behaviour as templates.ts's private interpolate(), duplicated here so
// the client preview can run without importing the server module.
export function interpolateTemplate(body: string, params: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, token: string) => params[token] ?? "");
}
