// The assistant's conversation script in Arabic (Saudi colloquial, speaking
// to the customer in the feminine) and English. Kept as a module rather than
// messages/*.json because the server composes these replies with data
// (names, prices, times). Widget chrome lives in messages under "assistant".
// No emoji anywhere, by brand rule.

import type { CallbackWindow, Concern, Contraindication, EventKind, Goal, SkinType } from "./types";

export type Locale = "ar" | "en";

export function asLocale(locale: string): Locale {
  return locale === "en" ? "en" : "ar";
}

type Pair = { ar: string; en: string };

export const CONCERN_LABELS: Record<Concern, Pair> = {
  acne: { ar: "حبوب وبثور", en: "Acne & breakouts" },
  scars: { ar: "آثار وندبات", en: "Marks & scars" },
  pigmentation: { ar: "تصبغات وكلف", en: "Pigmentation & melasma" },
  dullness: { ar: "بهتان ونقص نضارة", en: "Dullness" },
  dryness: { ar: "جفاف وقلة ترطيب", en: "Dryness & dehydration" },
  sensitivity: { ar: "حساسية واحمرار", en: "Sensitivity & redness" },
  aging: { ar: "خطوط وتجاعيد", en: "Fine lines & ageing" },
  pores: { ar: "مسام واسعة", en: "Large pores" },
  oiliness: { ar: "دهون ولمعان", en: "Oiliness" },
  dark_circles: { ar: "هالات تحت العين", en: "Dark circles" },
  hair_loss: { ar: "تساقط وخفة الشعر", en: "Hair loss & thinning" },
  dandruff: { ar: "قشرة وحكة الفروة", en: "Dandruff & itchy scalp" },
  hair_damage: { ar: "شعر تالف ومتقصف", en: "Damaged hair" },
  post_surgery: { ar: "تعافي بعد عملية", en: "Post-surgery recovery" },
};

export const GOAL_LABELS: Record<Goal, Pair> = {
  clear_skin: { ar: "بشرة صافية", en: "Clearer skin" },
  glow: { ar: "نضارة وإشراقة", en: "Glow & radiance" },
  even_tone: { ar: "لون موحد", en: "Even tone" },
  hydration: { ar: "ترطيب", en: "Hydration" },
  anti_aging: { ar: "شد ونعومة", en: "Firmer, smoother skin" },
  hair_growth: { ar: "شعر أكثف", en: "Thicker hair" },
  scalp_health: { ar: "فروة صحية", en: "A healthy scalp" },
  recovery: { ar: "تعافي أسرع", en: "Faster recovery" },
  maintenance: { ar: "عناية ودلع", en: "Ongoing care" },
};

export const EVENT_LABELS: Record<EventKind, Pair> = {
  wedding: { ar: "زواج", en: "wedding" },
  engagement: { ar: "ملكة", en: "engagement" },
  party: { ar: "مناسبة", en: "occasion" },
  graduation: { ar: "تخرج", en: "graduation" },
  eid: { ar: "العيد", en: "Eid" },
  travel: { ar: "سفر", en: "trip" },
};

export const SKIN_TYPE_LABELS: Record<SkinType, Pair> = {
  dry: { ar: "جافة", en: "Dry" },
  oily: { ar: "دهنية", en: "Oily" },
  combination: { ar: "مختلطة", en: "Combination" },
  normal: { ar: "عادية", en: "Normal" },
  sensitive: { ar: "حساسة", en: "Sensitive" },
};

export const CONTRA_LABELS: Record<Contraindication, Pair> = {
  pregnant: { ar: "حامل", en: "Pregnant" },
  breastfeeding: { ar: "مرضع", en: "Breastfeeding" },
  recent_procedure: { ar: "إجراء تجميلي حديث", en: "Recent procedure" },
  infection: { ar: "التهاب أو عدوى نشطة", en: "Active infection" },
  allergies: { ar: "حساسية معروفة", en: "Known allergies" },
};

export const WINDOW_LABELS: Record<CallbackWindow, Pair> = {
  asap: { ar: "بأقرب وقت", en: "As soon as possible" },
  morning: { ar: "الصباح", en: "Morning" },
  afternoon: { ar: "العصر", en: "Afternoon" },
  evening: { ar: "المساء", en: "Evening" },
};

const DAY_NAMES: Record<string, Pair> = {
  sun: { ar: "الأحد", en: "Sunday" },
  mon: { ar: "الإثنين", en: "Monday" },
  tue: { ar: "الثلاثاء", en: "Tuesday" },
  wed: { ar: "الأربعاء", en: "Wednesday" },
  thu: { ar: "الخميس", en: "Thursday" },
  fri: { ar: "الجمعة", en: "Friday" },
  sat: { ar: "السبت", en: "Saturday" },
};

export function dayName(key: string, locale: Locale): string {
  return DAY_NAMES[key]?.[locale] ?? key;
}

export function pick(pair: Pair, locale: Locale): string {
  return pair[locale];
}

/** "22:00" -> "10:00 PM" / "١٠:٠٠ م". */
export function formatClock(hhmm: string, locale: Locale): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(Date.UTC(2020, 0, 1, h ?? 0, m ?? 0));
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d);
}

const join = (items: string[], locale: Locale) => {
  if (items.length <= 1) return items.join("");
  const last = items[items.length - 1];
  return locale === "ar" ? `${items.slice(0, -1).join("، ")} و${last}` : `${items.slice(0, -1).join(", ")} and ${last}`;
};

export function listConcerns(concerns: Concern[], locale: Locale): string {
  return join(concerns.map((c) => CONCERN_LABELS[c][locale].toLowerCase()), locale);
}

/** Months -> "about a year" / "تقريباً سنة". */
export function describeDuration(months: number, locale: Locale): string {
  if (locale === "ar") {
    if (months < 1) return "أقل من شهر";
    if (months < 1.5) return "تقريباً شهر";
    if (months < 2.5) return "تقريباً شهرين";
    if (months < 11) return `تقريباً ${Math.round(months)} شهور`;
    if (months < 18) return "تقريباً سنة";
    if (months < 30) return "تقريباً سنتين";
    return `أكثر من ${Math.round(months / 12)} سنوات`;
  }
  if (months < 1) return "less than a month";
  if (months < 1.5) return "about a month";
  if (months < 11) return `about ${Math.round(months)} months`;
  if (months < 18) return "about a year";
  if (months < 30) return "about two years";
  return `over ${Math.round(months / 12)} years`;
}

// One-line "why" per service family, matched against the service slug.
const WHY_BY_SERVICE: { match: string; text: Pair }[] = [
  { match: "diagnostic", text: { ar: "نحلل بشرتك بالأجهزة ونطلع لك خطة علاج مناسبة لك بالضبط.", en: "A device-led analysis that turns into a treatment plan built for you." } },
  { match: "scalp-diagnostic", text: { ar: "نفحص الفروة وبصيلات الشعر ونعرف سبب المشكلة قبل أي علاج.", en: "We examine the scalp and follicles to find the cause before treating." } },
  { match: "peel", text: { ar: "يجدد سطح البشرة ويخفف الآثار والتصبغات ويصفي الملمس.", en: "Resurfaces to fade marks and pigmentation and refine texture." } },
  { match: "microderm", text: { ar: "يجدد سطح البشرة ويخفف الآثار والتصبغات ويصفي الملمس.", en: "Resurfaces to fade marks and pigmentation and refine texture." } },
  { match: "hydrafacial", text: { ar: "تنظيف عميق للمسام مع ترطيب ونضارة من أول جلسة.", en: "Deep-cleans pores and hydrates for visible glow from the first session." } },
  { match: "led-light", text: { ar: "ضوء لطيف يهدي الالتهاب والاحمرار ويدعم تجدد البشرة.", en: "Gentle light that calms inflammation and redness and supports renewal." } },
  { match: "lllt", text: { ar: "ضوء منخفض الشدة ينشط البصيلات ويدعم كثافة الشعر.", en: "Low-level light that stimulates follicles to support density." } },
  { match: "scalp-detox", text: { ar: "ينظف الفروة من التراكمات والقشرة ويهديها.", en: "Clears build-up and flakes and soothes the scalp." } },
  { match: "oxygen", text: { ar: "تدليك وأكسجين يحسن الدورة الدموية ويقوي الشعر.", en: "Massage and oxygen that boost circulation and strengthen hair." } },
  { match: "lymphatic", text: { ar: "تصريف لطيف يخفف التورم والتجمعات ويسرّع التعافي.", en: "Gentle drainage that reduces swelling and speeds up recovery." } },
  { match: "pressotherapy", text: { ar: "ضغط هوائي متدرج يخفف الاحتباس والتورم.", en: "Graduated air pressure that eases fluid retention and swelling." } },
  { match: "compression", text: { ar: "نتأكد إن المشد مناسب ومريح ويخدم نتيجة العملية.", en: "Makes sure your garment fits and supports your result." } },
  { match: "recovery", text: { ar: "مكان هادي ومجهز ترتاحين فيه بعد العملية بإشراف.", en: "A calm, supervised space to rest and recover." } },
];

export function whyFor(slug: string, summary: string, locale: Locale): string {
  const hit = WHY_BY_SERVICE.filter((w) => slug.includes(w.match)).sort((a, b) => b.match.length - a.match.length)[0];
  if (hit) return hit.text[locale];
  const first = summary.split(/(?<=[.!؟?])\s/)[0] ?? summary;
  return first.length > 120 ? `${first.slice(0, 117)}...` : first;
}

export function copy(locale: Locale) {
  const ar = locale === "ar";
  return {
    greeting: ar
      ? "أهلاً فيك في لونيا. أنا مساعدتك، أساعدك تعرفين وش يناسب بشرتك أو شعرك أو تعافيك، وأحجز لك بخطوات بسيطة. وش أكثر شي مضايقك هالفترة؟ تقدرين تختارين أو تكتبين بكلامك."
      : "Welcome to Lunia. I can help you work out what suits your skin, hair or recovery, and book it in a few steps. What's bothering you most at the moment? Pick one or describe it in your own words.",
    restarted: ar ? "خلينا نبدأ من جديد. وش أكثر شي مضايقك هالفترة؟" : "Let's start fresh. What's bothering you most at the moment?",
    helloAgain: ar ? "هلا والله، حياك." : "Hello, lovely to hear from you.",
    welcomeBack: ar ? "حياك من جديد. نكمل من وين وقفنا؟" : "Welcome back. Shall we pick up where we left off?",
    thanks: ar ? "العفو، بالخدمة دايماً." : "You're very welcome.",
    notUnderstood: ar
      ? "ما فهمت عليك تماماً. تقدرين تختارين من الخيارات تحت، أو تكتبين لي بطريقة ثانية."
      : "I didn't quite catch that. You can pick one of the options below or put it another way.",
    concernRetry: ar
      ? "سجلت كلامك. أي من هذي أقرب لوضعك؟ وإذا مو متأكدة نبدأ بتحليل تشخيصي."
      : "Noted. Which of these is closest? If you're not sure, a diagnostic analysis is a great place to start.",
    tooLong: ar ? "رسالتك طويلة شوي، ممكن تختصرينها؟" : "That message is a little long. Could you shorten it?",
    rateLimited: ar ? "لحظة شوي، وصلتني رسائل كثيرة بوقت قصير. جربي بعد دقيقة." : "One moment, that was a lot of messages at once. Please try again in a minute.",
    genericError: ar ? "صار خلل بسيط من عندنا. جربي مرة ثانية أو اطلبي نتصل فيك." : "Something went wrong on our side. Please try again, or ask us to call you.",

    // Intake questions
    askConcern: ar ? "وش أكثر شي مضايقك هالفترة؟ اختاري أو اكتبي بكلامك." : "What's bothering you most at the moment? Pick one or describe it in your own words.",
    askConcernAck: (concerns: string) => (ar ? `فهمت عليك، ${concerns}.` : `Got it: ${concerns}.`),
    askDuration: ar ? "من متى تقريباً وأنتِ تلاحظينها؟" : "Roughly how long have you noticed it?",
    askDurationSurgery: ar ? "متى كانت العملية تقريباً؟" : "When was your procedure, roughly?",
    askTried: ar ? "جربتي شي قبل؟ منتجات بالبيت أو جلسات عند مختص؟" : "Have you tried anything so far, at-home products or clinic treatments?",
    askGoal: ar ? "وش النتيجة اللي تتمنينها؟ وعندك مناسبة قريبة؟" : "What result are you hoping for? Is there an occasion coming up?",
    askWhen: ar ? "متى المناسبة تقريباً؟" : "When is it, roughly?",
    askSkin: ar ? "وش نوع بشرتك غالباً؟" : "How would you describe your skin type?",
    askSafety: ar
      ? "سؤال أخير للسلامة: هل ينطبق عليك شي من هذي؟"
      : "One last safety check: do any of these apply to you right now?",
    backToQuestion: ar ? "نكمل استشارتك:" : "Back to your consultation:",

    // Recommendation
    recIntro: (summary: string) =>
      ar ? `شكراً لك. بناءً على كلامك (${summary})، هذي الخدمات اللي أنصحك تبدين فيها:` : `Thank you. Based on what you shared (${summary}), this is where I'd start:`,
    recIntroUnsure: ar
      ? "أفضل بداية لك تحليل تشخيصي، نشوف فيه بشرتك أو فروتك بدقة ونطلع لك خطة مناسبة:"
      : "The best first step is a diagnostic analysis, so we can look closely and build the right plan:",
    recDiagnosticFirst: ar
      ? "وبما إن وضعك فيه أكثر من جانب، أنصحك تبدين بالتحليل التشخيصي."
      : "Since there's a bit going on, I'd suggest starting with the diagnostic analysis.",
    recEventSoon: (weeks: number) =>
      ar
        ? `وبما إن موعدك بعد ${weeks <= 2 ? "أسبوعين تقريباً" : `${weeks} أسابيع تقريباً`}، الأفضل تبدين بدري عشان تلحقين النتيجة.`
        : `With your date about ${weeks} week${weeks === 1 ? "" : "s"} away, it's best to start soon so results can build.`,
    recCareful: ar
      ? "شكراً إنك وضحتي. عشان سلامتك، ما أحجز لك علاجات من هنا. الأفضل تكلمك أخصائية وتنصحك باللي يناسب وضعك بالضبط، وتقدر تجهز لك استشارة."
      : "Thank you for telling me. For your safety I won't book treatments here. A specialist should speak with you first and advise what suits you, and can arrange a consultation.",
    recAllergyNote: ar ? "وبلغي الأخصائية بالحساسية اللي عندك قبل الجلسة." : "Please mention your allergies to the specialist before your session.",
    recNotOnline: ar ? "ينحجز مع فريقنا مباشرة" : "Arranged with our team",
    recTierNote: (tier: string) => (ar ? `خاصة بعضوية ${tier}` : `For ${tier} members`),
    recWhatNext: ar ? "وش تحبين نسوي الحين؟" : "What would you like to do next?",
    recUpdated: ar ? "حدثت اقتراحاتي على كلامك الجديد." : "I've updated my suggestions with that.",
    durationLabel: (min: number) => (ar ? `${min} دقيقة` : `${min} min`),
    priceFrom: (price: string) => (ar ? `تبدأ من ${price}` : `From ${price}`),

    // Booking
    bookPickService: ar ? "أي خدمة تحبين تحجزين؟" : "Which service would you like to book?",
    bookNotOnline: (name: string) =>
      ar
        ? `«${name}» ننسقها معك مباشرة عشان نتأكد إنها مناسبة لك. تحبين نتصل فيك؟`
        : `"${name}" is arranged with our team directly so we can make sure it suits you. Shall we call you?`,
    bookTierGate: (tier: string) =>
      ar ? `هذي الخدمة خاصة بعضوية ${tier}. إذا كنتِ عضوة نكمل عادي.` : `This service is for ${tier} members. If you're a member, let's continue.`,
    bookPickDay: (name: string) => (ar ? `تمام، «${name}». أي يوم يناسبك؟` : `Lovely, "${name}". Which day suits you?`),
    bookNoSlots: ar ? "للأسف هذا اليوم مليان. اختاري يوم ثاني:" : "That day is fully booked. Please choose another day:",
    bookPickTime: (day: string) => (ar ? `هذي الأوقات المتاحة يوم ${day}:` : `Here are the free times on ${day}:`),
    bookAskName: ar ? "على أي اسم أسجل الحجز؟" : "What name should I book under?",
    bookBadName: ar ? "اكتبي اسمك بس لو سمحتي (بدون أرقام)." : "Please type just your name (no numbers).",
    bookAskPhone: ar ? "وش رقم جوالك؟ برسل لك رمز تأكيد عليه." : "What's your mobile number? I'll send a confirmation code to it.",
    bookBadPhone: ar ? "الرقم ما وضح لي. اكتبيه كذا: 05XXXXXXXX" : "That number doesn't look right. Please type it like 05XXXXXXXX.",
    bookUsingPhone: (phone: string) => (ar ? `برسل رمز التأكيد على ${phone}.` : `I'll send the confirmation code to ${phone}.`),
    bookCodeSent: (phone: string) =>
      ar ? `أرسلت لك رمز من ٦ أرقام على ${phone}. اكتبيه هنا لتأكيد الحجز.` : `I've sent a 6-digit code to ${phone}. Type it here to confirm your booking.`,
    bookDevCode: (code: string) => (ar ? `(بيئة التجربة: الرمز ${code})` : `(Development only: the code is ${code})`),
    bookBadCode: ar ? "الرمز ما طابق. تأكدي منه وجربي مرة ثانية." : "That code didn't match. Please check it and try again.",
    bookCodeFormat: ar ? "الرمز ٦ أرقام، اكتبيه لو سمحتي." : "The code is 6 digits. Please type it in.",
    bookOtpLimited: ar ? "طلبتي رموز كثيرة. جربي بعد شوي، أو خلينا نتصل فيك." : "Too many codes were requested. Please try later, or let us call you.",
    bookSlotTaken: ar ? "للأسف أحد سبقك على هالوقت. اختاري وقت ثاني:" : "Someone just took that time. Please choose another:",
    bookTierDenied: (tier: string) =>
      ar ? `هذي الخدمة خاصة بعضوية ${tier}، وما قدرت أحجزها لك. نتصل فيك ونرتبها؟` : `This service is for ${tier} members, so I couldn't book it. Shall we call you to arrange it?`,
    bookFailed: ar ? "ما قدرت أكمل الحجز. تحبين نتصل فيك ونرتبه معك؟" : "I couldn't complete the booking. Would you like us to call you to arrange it?",
    bookConfirmed: (name: string) =>
      ar ? `تم تأكيد حجزك يا ${name}. بيوصلك تأكيد برسالة، ونتطلع نشوفك.` : `You're booked, ${name}. A confirmation message is on its way. We look forward to seeing you.`,
    bookSummaryTitle: ar ? "تفاصيل الحجز" : "Booking details",
    summaryService: ar ? "الخدمة" : "Service",
    summaryWhen: ar ? "الموعد" : "When",
    summaryPrice: ar ? "السعر" : "Price",
    summaryRef: ar ? "رقم الحجز" : "Reference",
    viewBookings: ar ? "حجوزاتي" : "My bookings",
    careful: ar ? "عشان سلامتك، الأفضل تكلمك أخصائية قبل أي حجز. أرتب لك اتصال؟" : "For your safety, a specialist should speak with you before any booking. Shall I arrange a call?",

    // Call-back
    cbAskName: ar ? "أكيد، أحد من فريقنا بيتصل فيك. وش اسمك؟" : "Of course, someone from our team will call you. What's your name?",
    cbAskPhone: ar ? "وش رقم الجوال اللي نتصل عليه؟" : "Which mobile number should we call?",
    cbAskWindow: (phone: string) => (ar ? `بنتصل على ${phone}. أي وقت يناسبك؟` : `We'll call ${phone}. When suits you best?`),
    cbDone: (when: string) =>
      ar ? `تم. بتتصل فيك أخصائية من لونيا ${when}. إذا احتجتي شي ثاني أنا هنا.` : `Done. A Lunia specialist will call you ${when}. I'm here if you need anything else.`,
    cbWhenSoon: ar ? "خلال ساعة تقريباً" : "within about an hour",
    cbWhenAt: (day: string, time: string) => (ar ? `${day} الساعة ${time} تقريباً` : `${day} at around ${time}`),
    cbFailed: ar ? "ما قدرت أسجل الطلب. جربي مرة ثانية أو كلمينا واتساب." : "I couldn't save your request. Please try again or message us on WhatsApp.",
    today: ar ? "اليوم" : "today",
    tomorrow: ar ? "بكرة" : "tomorrow",

    // WhatsApp
    waOpen: ar ? "حياك على واتساب، جهزت لك رسالة فيها ملخص استشارتك." : "Continue on WhatsApp. I've prepared a message with your consultation summary.",
    waButton: ar ? "افتحي واتساب" : "Open WhatsApp",
    waUnavailable: ar ? "واتساب مو متاح حالياً، تقدرين تطلبين نتصل فيك." : "WhatsApp isn't available right now, but we can call you.",
    waMessageIntro: ar ? "مرحبا لونيا، تواصلت معكم من المساعد في الموقع." : "Hello Lunia, I'm contacting you from the website assistant.",
    waConcerns: ar ? "اهتمامي" : "My concerns",
    waGoal: ar ? "هدفي" : "My goal",
    waSuggested: ar ? "الخدمات المقترحة" : "Suggested services",

    // FAQ
    faqPrompt: ar ? "وش حابة تعرفين؟" : "What would you like to know?",
    faqHoursOpen: (close: string) => (ar ? `مفتوحين الحين إلى الساعة ${close}.` : `We're open now until ${close}.`),
    faqHoursClosed: (when: string) => (ar ? `مسكرين الحين، ونفتح ${when}.` : `We're closed right now and open ${when}.`),
    faqHoursWeek: (lines: string) => (ar ? `أوقات الدوام:\n${lines}` : `Opening hours:\n${lines}`),
    faqHoursUnknown: ar ? "أوقات الدوام تتحدث قريباً، كلمينا واتساب ونفيدك." : "Our hours are being updated. Message us on WhatsApp and we'll confirm.",
    closedLabel: ar ? "مغلق" : "Closed",
    faqLocation: (address: string) => (ar ? `موقعنا: ${address}.` : `You'll find us at ${address}.`),
    faqLocationLink: ar ? "افتحي الخريطة" : "Open in Maps",
    faqPrices: (lines: string) =>
      ar ? `الأسعار تبدأ من:\n${lines}\nالسعر النهائي يتحدد حسب خطتك بعد التحليل.` : `Prices start from:\n${lines}\nYour final price depends on your plan after the analysis.`,
    faqGiftCards: ar
      ? "عندنا بطاقات هدايا بالقيمة اللي تختارينها، تنرسل للي تحبين وتنستخدم على أي خدمة."
      : "We offer gift cards in any amount, sent to whoever you like and usable on any service.",
    faqGiftCardsLink: ar ? "بطاقات الهدايا" : "Gift cards",
    faqPayment: ar
      ? "الحجز أونلاين ما يحتاج دفع مسبق، والدفع يكون بالمركز بعد الجلسة. وتقدرين تستخدمين بطاقة الهدايا بعد. لتفاصيل طرق الدفع والتقسيط فريقنا يفيدك."
      : "Booking online needs no prepayment; you pay at the center after your session, and gift cards can be used too. Our team can confirm payment and instalment options.",
    faqParking: ar
      ? "فيه مواقف قريبة من المركز. ولو تحتاجين توجيه، افتحي الخريطة أو كلمينا واتساب ونساعدك."
      : "There's parking close to the center. If you need directions, open the map or message us on WhatsApp.",
    faqDuration: (range: string) =>
      ar
        ? `أغلب الجلسات تاخذ ${range}. نرجو الحضور قبل الموعد بعشر دقايق.`
        : `Most sessions take ${range}. Please arrive about ten minutes early.`,
    minutesRange: (lo: number, hi: number) => (ar ? `بين ${lo} و${hi} دقيقة` : `between ${lo} and ${hi} minutes`),

    // Summary labels (booking chips etc.)
    chip: {
      bookDirect: ar ? "أبي أحجز مباشرة" : "Book directly",
      questions: ar ? "عندي سؤال" : "I have a question",
      callMe: ar ? "اتصلوا فيني" : "Call me back",
      whatsapp: ar ? "كمّلي على واتساب" : "Continue on WhatsApp",
      skip: ar ? "تخطي" : "Skip",
      notSure: ar ? "مو متأكدة" : "Not sure",
      other: ar ? "شي ثاني" : "Something else",
      book: (name: string) => (ar ? `احجزي ${name}` : `Book ${name}`),
      bookAppointment: ar ? "احجزي موعد" : "Book an appointment",
      recs: ar ? "اقتراحاتي" : "My suggestions",
      consult: ar ? "ابدئي الاستشارة" : "Start a consultation",
      restart: ar ? "ابدئي من جديد" : "Start over",
      back: ar ? "رجوع" : "Back",
      moreDays: ar ? "أيام ثانية" : "More dates",
      earlierDays: ar ? "أيام أقرب" : "Earlier dates",
      otherDay: ar ? "يوم ثاني" : "Another day",
      resend: ar ? "أرسلي الرمز مرة ثانية" : "Resend code",
      changePhone: ar ? "رقم ثاني" : "Use another number",
      durShort: ar ? "أقل من ٣ شهور" : "Under 3 months",
      durMid: ar ? "٣ شهور لسنة" : "3 to 12 months",
      durLong: ar ? "أكثر من سنة" : "Over a year",
      durYears: ar ? "من سنين" : "For years",
      psRecent: ar ? "أقل من أسبوعين" : "Under 2 weeks ago",
      psMid: ar ? "من ٢ إلى ٦ أسابيع" : "2 to 6 weeks ago",
      psLong: ar ? "أكثر من ٦ أسابيع" : "Over 6 weeks ago",
      triedNone: ar ? "ما جربت شي" : "Nothing yet",
      triedHome: ar ? "منتجات بالبيت" : "At-home products",
      triedClinic: ar ? "جلسات عند مختص" : "Clinic treatments",
      goalEvent: ar ? "عندي مناسبة قريبة" : "An occasion is coming up",
      when2w: ar ? "خلال أسبوعين" : "Within 2 weeks",
      when6w: ar ? "خلال شهر ونص" : "Within 6 weeks",
      whenLater: ar ? "بعد أكثر" : "Later than that",
      safetyNone: ar ? "ولا شي منها" : "None of these",
      safetyPregnant: ar ? "حامل أو مرضع" : "Pregnant or breastfeeding",
      safetyRecent: ar ? "سويت إجراء تجميلي مؤخراً" : "Recent cosmetic procedure",
      safetyInfection: ar ? "التهاب أو عدوى بالبشرة" : "Active skin infection",
      safetyAllergy: ar ? "عندي حساسية معروفة" : "Known allergies",
      faqHours: ar ? "أوقات الدوام" : "Opening hours",
      faqLocation: ar ? "الموقع" : "Location",
      faqPrices: ar ? "الأسعار" : "Prices",
      faqGift: ar ? "بطاقات الهدايا" : "Gift cards",
      faqPayment: ar ? "الدفع" : "Payment",
      faqParking: ar ? "المواقف" : "Parking",
      faqDuration: ar ? "مدة الجلسة" : "Session length",
    },

    // Placeholders
    placeholder: {
      text: ar ? "اكتبي رسالتك..." : "Type a message...",
      name: ar ? "اسمك" : "Your name",
      tel: ar ? "05XXXXXXXX" : "05XXXXXXXX",
      code: ar ? "رمز من ٦ أرقام" : "6-digit code",
    },
  };
}

export type Copy = ReturnType<typeof copy>;
