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
  "CALLBACK_ACK",
  "INVOICE",
  "PACKAGE_EXPIRING",
  "WIN_BACK",
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
  CALLBACK_ACK: {
    label: "Call-back acknowledgement",
    description: "Sent when a customer asks us to call them (website assistant).",
    placeholders: ["name", "when"],
  },
  INVOICE: {
    label: "Invoice",
    description: "Sent from Billing with the invoice link (and an online pay link when one is due).",
    placeholders: ["invoiceNumber", "total", "link", "payLine"],
  },
  PACKAGE_EXPIRING: {
    label: "Package expiring soon",
    description: "Automatic: sent once, before a prepaid package with sessions left expires (Settings → Automations).",
    placeholders: ["name", "packageName", "sessionsLeft", "expiresOn", "link"],
  },
  WIN_BACK: {
    label: "We miss you (win-back)",
    description: "Automatic: invites customers who haven't visited for a while to come back. Marketing — only to customers who allow offers (Settings → Automations).",
    placeholders: ["name", "lastService", "link"],
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
  PACKAGE_EXPIRING: {
    ar: "هلا {{name}}، باقتك {{packageName}} في لونيا باقي فيها {{sessionsLeft}} جلسة، وتنتهي بتاريخ {{expiresOn}}.\n\nاحجزي جلستك الحين عشان ما تروح عليك:\n{{link}}",
    en: "Hi {{name}}, your Lunia {{packageName}} package still has {{sessionsLeft}} session(s) left and expires on {{expiresOn}}.\n\nBook your next session before it does:\n{{link}}",
  },
  WIN_BACK: {
    ar: "هلا {{name}}، اشتقنا لك في لونيا!\n\nصار لك فترة من آخر زيارة ({{lastService}})، وبشرتك تستاهل شوية اهتمام. احجزي موعدك الجاي من هنا:\n{{link}}",
    en: "Hi {{name}}, we miss you at Lunia!\n\nIt's been a while since your last visit ({{lastService}}). Your skin deserves some care — book your next appointment here:\n{{link}}",
  },
  CONFIRMATION: {
    ar: "تم تأكيد حجزك في لونيا لـ{{serviceName}} يوم {{dateTime}}.\n\nرقم الحجز: {{bookingId}}\n\nبانتظارك، ونتشرف بزيارتك.",
    en: "Your Lunia booking for {{serviceName}} is confirmed for {{dateTime}}.\n\nBooking reference: {{bookingId}}\n\nWe look forward to welcoming you.",
  },
  REMINDER_24H: {
    ar: "تذكير: موعدك في لونيا لـ{{serviceName}} بكرة {{dateTime}}.\n\nرقم الحجز: {{bookingId}}\n\nإذا تبين تغيرين الموعد، كلمينا وبنرتب لك.",
    en: "A friendly reminder: your Lunia appointment for {{serviceName}} is tomorrow, {{dateTime}}.\n\nBooking reference: {{bookingId}}\n\nLet us know if you'd like to reschedule.",
  },
  POST_VISIT: {
    ar: "شكراً على زيارتك للونيا لـ{{serviceName}}.\n\nإن شاء الله عجبتك التجربة، وننتظرك مرة ثانية.",
    en: "Thank you for visiting Lunia for your {{serviceName}}.\n\nWe hope you had a wonderful experience and can't wait to welcome you back.",
  },
  OTP: {
    ar: "رمز التحقق من لونيا: {{code}}\n\nصالح لمدة 5 دقائق. لا تشاركين الرمز مع أي أحد.",
    en: "Your Lunia verification code is {{code}}\n\nIt is valid for 5 minutes. Please don't share it with anyone.",
  },
  WAITLIST_OPEN: {
    ar: "خبر حلو! انفتح موعد في لونيا لـ{{serviceName}} اللي كنتِ تنتظرينه.\n\nاحجزيه الحين قبل لا ينحجز.",
    en: "Good news! A spot just opened at Lunia for {{serviceName}}.\n\nBook now before it's taken.",
  },
  REVIEW_REQUEST: {
    ar: "شكراً على زيارتك للونيا لـ{{serviceName}}.\n\nيهمنا نسمع رأيك في تجربتك، ما ياخذ إلا دقيقة:\n{{link}}",
    en: "Thank you for visiting Lunia for your {{serviceName}}.\n\nWe'd love to hear about your experience:\n{{link}}",
  },
  CALLBACK_ACK: {
    ar: "هلا {{name}}، وصلنا طلبك في لونيا.\n\nبتتصل فيك وحدة من أخصائياتنا {{when}}.\n\nشكراً لك.",
    en: "Hi {{name}}, we've received your request at Lunia.\n\nA specialist will call you {{when}}.\n\nThank you.",
  },
  INVOICE: {
    ar: "هلا {{name}}، فاتورتك من لونيا رقم {{invoiceNumber}} بمبلغ {{total}} جاهزة. تقدرين تشوفينها وتطبعينها من هنا:\n{{link}}\n\n{{payLine}}",
    en: "Hi {{name}}, your Lunia invoice {{invoiceNumber}} for {{total}} is ready. View or print it here:\n{{link}}\n\n{{payLine}}",
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
      return isAr ? "رمز التحقق من لونيا" : "Your Lunia code";
    case "CONFIRMATION":
      return isAr ? "تم تأكيد حجزك في لونيا" : "Your Lunia booking is confirmed";
    case "REMINDER_24H":
      return isAr ? "تذكير بموعدك بكرة في لونيا" : "Your Lunia appointment reminder";
    case "POST_VISIT":
      return isAr ? "شكراً على زيارتك للونيا" : "Thank you for visiting Lunia";
    case "WAITLIST_OPEN":
      return isAr ? "انفتح موعد كنتِ تنتظرينه في لونيا" : "A spot opened up at Lunia";
    case "REVIEW_REQUEST":
      return isAr ? "شاركينا رأيك في زيارتك للونيا" : "Share your Lunia experience";
    case "CALLBACK_ACK":
      return isAr ? "وصلنا طلب الاتصال" : "We'll call you shortly";
    case "INVOICE":
      return isAr ? "فاتورتك من لونيا" : "Your Lunia invoice";
    case "PACKAGE_EXPIRING":
      return isAr ? "باقتك في لونيا قربت تنتهي" : "Your Lunia package expires soon";
    case "WIN_BACK":
      return isAr ? "اشتقنا لك في لونيا" : "We miss you at Lunia";
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
        name: "نورة",
        when: "بكرة الساعة ١٠:٠٠ ص تقريباً",
        invoiceNumber: "INV-2026-000123",
        total: "1,150.00 ر.س",
        payLine: "تقدرين تدفعين أونلاين بأمان من هنا: https://lunia.sa/p/8k2x",
        packageName: "٦ جلسات هيدرافيشل",
        sessionsLeft: "٢",
        expiresOn: "١٥ نوفمبر ٢٠٢٦",
        lastService: "جلسة نضارة الوجه",
      }
    : {
        serviceName: "Radiance Facial",
        dateTime: "Sunday, Sep 22 at 4:00 PM",
        bookingId: "LUN-4821",
        code: "482913",
        link: "https://lunia.sa/r/az8y",
        name: "Sarah",
        when: "tomorrow at around 10:00 AM",
        invoiceNumber: "INV-2026-000123",
        total: "1,150.00 SAR",
        payLine: "Pay online securely here: https://lunia.sa/p/8k2x",
        packageName: "6× HydraFacial",
        sessionsLeft: "2",
        expiresOn: "Nov 15, 2026",
        lastService: "Radiance Facial",
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
