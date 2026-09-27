// Keyword lexicon for the rule-based understanding layer: Arabic (MSA + Saudi
// colloquial, with common misspellings) and English. Patterns are written
// naturally here and folded with normalizeText() once at load, so "حبوب" and
// "حبوبْ", "ة" and "ه", "أ" and "ا" all match the same entry. Single words are
// also matched as stems and with a small typo budget (see TextMatcher).

import { normalizeText } from "../normalize";
import type { Area, Concern, Contraindication, EventKind, Goal, Intent, SkinType } from "../types";

type Lexicon<K extends string> = Record<K, string[]>;

function fold<K extends string>(lex: Lexicon<K>): Record<K, string[]> {
  const out = {} as Record<K, string[]>;
  for (const key of Object.keys(lex) as K[]) out[key] = [...new Set(lex[key].map(normalizeText).filter(Boolean))];
  return out;
}

export const CONCERN_LEXICON = fold<Concern>({
  acne: [
    "حبوب", "حبوبي", "حب الشباب", "حبوب الشباب", "بثور", "رؤوس سوداء", "رؤوس سودا", "رووس سود", "روس سوداء",
    "رؤوس بيضاء", "بلاك هيدز", "طلعات", "دمامل", "حبوب ملتهبه",
    "acne", "pimple", "pimples", "breakout", "breakouts", "breaking out", "zit", "zits", "blackhead", "blackheads",
    "whitehead", "whiteheads", "cystic", "blemish", "blemishes",
  ],
  scars: [
    "ندبات", "ندبه", "اثار حبوب", "آثار الحبوب", "اثار الحبوب", "اثار", "حفر", "حفر الحبوب",
    "scar", "scars", "scarring", "acne scars", "pitted", "marks", "acne marks",
  ],
  pigmentation: [
    "تصبغ", "تصبغات", "تصبغات", "صبغه", "كلف", "نمش", "بقع", "بقعه", "بقع داكنه", "بقع غامقه", "اسمرار", "غمقان", "غماق",
    "تفاوت اللون", "لون غير موحد", "توحيد اللون", "سواد", "تصبقات",
    "pigmentation", "pigment", "hyperpigmentation", "melasma", "dark spots", "dark spot", "sun spots", "sunspots",
    "age spots", "uneven tone", "uneven skin tone", "freckles", "discoloration", "discolouration", "dark patches",
  ],
  dullness: [
    "بهتان", "باهته", "باهتة", "شحوب", "شاحبه", "بشرتي تعبانه", "تعبانه", "ذبلانه", "ما فيها حياه", "نضاره", "نضارة", "اشراقه",
    "dull", "dullness", "lifeless", "tired skin", "tired looking", "radiance", "glow", "glowing",
  ],
  dryness: [
    "جفاف", "جافه", "جافة", "ناشفه", "نشفان", "تقشر", "قشور", "ترطيب", "مو رطبه", "شد بالبشره",
    "dry", "dryness", "dehydrated", "dehydration", "flaky", "flaking", "tight skin", "tightness",
  ],
  sensitivity: [
    "بشره حساسه", "بشرتي حساسه", "حساسه", "احمرار", "تهيج", "تتهيج", "حرقان", "حراره بالوجه", "الورديه", "وردية",
    "sensitive", "sensitivity", "redness", "irritation", "irritated", "rosacea", "flushing", "stinging", "reactive",
  ],
  aging: [
    "تجاعيد", "خطوط", "خطوط رفيعه", "خطوط التعبير", "ترهل", "ارتخاء", "شيخوخه", "تقدم بالسن", "علامات التقدم", "كبر السن",
    "شد البشره", "مرونه", "خطوط الضحك", "عين الغراب",
    "wrinkle", "wrinkles", "fine lines", "lines", "aging", "ageing", "anti aging", "anti-aging", "sagging", "firmness",
    "crow's feet", "crows feet", "loose skin", "elasticity",
  ],
  pores: [
    "مسام", "مسامات", "مسام واسعه", "مسامات واسعه", "المسام",
    "pores", "pore", "large pores", "enlarged pores", "open pores",
  ],
  oiliness: [
    "دهنيه", "دهنية", "بشره دهنيه", "دهون بالوجه", "لمعان", "زيوت", "افرازات دهنيه",
    "oily", "oiliness", "greasy", "shiny", "sebum",
  ],
  dark_circles: [
    "هالات", "هالات سوداء", "هالات سودا", "سواد تحت العين", "تحت العين", "انتفاخ تحت العين", "جيوب",
    "dark circles", "under eye", "under-eye", "eye bags", "puffy eyes",
  ],
  hair_loss: [
    "تساقط", "تساقط الشعر", "شعري يطيح", "يطيح", "يتساقط", "خفة الشعر", "شعري خفيف", "فراغات", "صلع", "صلعه", "قرعه",
    "كثافه الشعر", "شعري خفيف", "فراغات بالراس",
    "hair loss", "hairloss", "hair fall", "hairfall", "falling hair", "losing hair", "thinning", "thin hair", "bald",
    "balding", "receding", "alopecia", "shedding",
  ],
  dandruff: [
    "قشره", "قشرة", "قشرة الراس", "حكة الراس", "حكه بالراس", "راسي يحكني", "دهون الراس", "التهاب الفروه",
    "dandruff", "flaky scalp", "itchy scalp", "oily scalp", "seborrheic", "seborrhea",
  ],
  hair_damage: [
    "شعر تالف", "تلف", "تقصف", "تقصف الشعر", "هيشان", "منفوش", "شعري خربان",
    "damaged hair", "frizz", "frizzy", "breakage", "split ends", "brittle hair",
  ],
  post_surgery: [
    "عمليه", "عملية", "بعد العمليه", "بعد عمليه", "عملية تجميل", "شفط", "شفط دهون", "نحت", "نحت الجسم", "شد بطن", "تكميم",
    "تورم", "كدمات", "تليف", "تليفات", "تعافي", "نقاهه", "لمفاوي", "تصريف لمفاوي", "مشد", "مشد طبي",
    "surgery", "post op", "post-op", "postop", "post surgery", "post-surgery", "after surgery", "lipo", "liposuction",
    "tummy tuck", "bbl", "swelling", "bruising", "recovery", "fibrosis", "lymphatic", "compression garment",
  ],
});

export const AREA_LEXICON = fold<Area>({
  face: ["وجه", "وجهي", "بشره", "بشرتي", "خدود", "جبهه", "ذقن", "انف", "face", "facial", "cheeks", "forehead", "chin", "nose", "skin"],
  scalp: ["شعر", "شعري", "راس", "راسي", "فروه", "hair", "scalp", "head"],
  body: ["جسم", "جسمي", "ظهر", "بطن", "ارداف", "فخذ", "ذراع", "ساق", "body", "back", "belly", "stomach", "tummy", "thighs", "arms", "legs"],
});

export const SKIN_TYPE_LEXICON = fold<SkinType>({
  dry: ["جافه", "جافة", "ناشفه", "dry"],
  oily: ["دهنيه", "دهنية", "oily", "greasy"],
  combination: ["مختلطه", "مختلطة", "مختلط", "combination", "combo", "mixed"],
  normal: ["عاديه", "طبيعيه", "normal"],
  sensitive: ["حساسه", "حساسة", "sensitive"],
});

export const GOAL_LEXICON = fold<Goal>({
  clear_skin: ["تصفى", "تصفا", "صافيه", "صفاء", "نقاء", "نقيه", "تنظيف", "انظف", "clear", "clearer", "clear skin", "clean skin"],
  glow: ["نضاره", "نضارة", "تلمع", "تشع", "اشراقه", "توهج", "glow", "glowing", "radiant", "radiance", "bright", "brighter"],
  even_tone: ["توحيد", "موحده", "توحيد اللون", "even tone", "even out", "brighten", "lighter"],
  hydration: ["ترطيب", "رطبه", "hydrated", "hydration", "moisturized", "plump"],
  anti_aging: ["اصغر", "مشدوده", "شباب", "younger", "firm", "firmer", "lift", "tighten"],
  hair_growth: ["يكثف", "كثافه", "كثيف", "ينبت", "يطول", "thicker", "regrow", "regrowth", "fuller", "grow back", "denser"],
  scalp_health: ["فروه صحيه", "راس صحي", "healthy scalp"],
  recovery: ["اتعافى", "تعافي", "يخف التورم", "يروح التورم", "recover", "heal", "reduce swelling"],
  maintenance: ["عنايه", "روتين", "استرخاء", "دلع", "maintenance", "routine", "pamper", "relax", "self care", "treat myself"],
});

export const EVENT_LEXICON = fold<EventKind>({
  wedding: ["زواج", "زواجي", "عرس", "عرسي", "زفاف", "زفافي", "ليله العمر", "wedding", "bride", "marriage"],
  engagement: ["ملكه", "ملكتي", "ملكة", "خطوبه", "خطوبتي", "engagement", "engaged"],
  party: ["حفله", "حفلة", "مناسبه", "مناسبة", "عزيمه", "party", "event", "occasion", "gala"],
  graduation: ["تخرج", "تخرجي", "graduation"],
  eid: ["عيد", "العيد", "رمضان", "eid", "ramadan"],
  travel: ["سفر", "سفري", "مسافره", "اجازه", "شهر العسل", "travel", "trip", "vacation", "holiday", "honeymoon"],
});

export const CONTRA_LEXICON = fold<Contraindication>({
  pregnant: ["حامل", "حمل", "الحمل", "pregnant", "pregnancy", "expecting"],
  breastfeeding: ["ارضع", "رضاعه", "رضاعة", "مرضع", "ارضاع", "breastfeeding", "breast feeding", "nursing"],
  recent_procedure: ["سويت ليزر", "سويت بوتوكس", "سويت فيلر", "just had", "recent procedure", "recently had"],
  infection: ["عدوى", "هربس", "جرح مفتوح", "جروح مفتوحه", "فطريات", "infection", "infected", "herpes", "cold sore", "open wound", "fungal"],
  allergies: ["حساسيه من", "حساسية من", "حساسيه ضد", "حساسيه لل", "allergic", "allergy", "allergies"],
});

// Treatments someone may already have tried (kept as short English labels
// for the staff-facing summary).
export const TREATMENT_LEXICON = fold<string>({
  creams: ["كريم", "كريمات", "مرطب", "cream", "creams", "moisturizer", "moisturiser"],
  serums: ["سيروم", "سيرومات", "serum", "serums"],
  retinol: ["ريتينول", "ريتنول", "retinol", "retinoid", "tretinoin", "differin"],
  vitamin_c: ["فيتامين سي", "vitamin c"],
  niacinamide: ["نياسيناميد", "niacinamide"],
  isotretinoin: ["روكتان", "روكاتان", "ابتريتنوين", "accutane", "roaccutane", "isotretinoin"],
  antibiotics: ["مضاد حيوي", "مضادات حيويه", "antibiotic", "antibiotics"],
  peel: ["تقشير", "بيلنق", "peel", "peeling", "chemical peel"],
  laser: ["ليزر", "laser", "ipl"],
  botox: ["بوتوكس", "botox"],
  filler: ["فيلر", "filler", "fillers"],
  hydrafacial: ["هيدرافيشل", "هايدرا", "hydrafacial", "hydra facial"],
  facial: ["فيشل", "تنظيف بشره", "facial", "facials"],
  microneedling: ["ميكرونيدلنق", "ديرما بن", "ديرمابن", "microneedling", "dermapen", "derma pen"],
  prp: ["بلازما", "prp", "plasma"],
  mesotherapy: ["ميزو", "ميزوثيرابي", "meso", "mesotherapy"],
  minoxidil: ["مينوكسيديل", "منوكسيديل", "minoxidil", "rogaine"],
  supplements: ["فيتامينات", "مكملات", "بيوتين", "supplements", "vitamins", "biotin"],
  shampoo: ["شامبو", "shampoo"],
  home_remedies: ["خلطات", "وصفات طبيعيه", "home remedies", "diy"],
});

export const TRIED_NOTHING = [
  "ما جربت شي", "ما جربت شيء", "ماجربت", "ما جربت", "ولا شي", "ولا شيء", "لا شي", "ما سويت شي", "ما استخدمت شي",
  "nothing", "nothing yet", "haven't tried", "havent tried", "not tried", "never tried", "none",
].map(normalizeText);

export const NONE_OF_THESE = [
  "لا شي", "ولا شي", "ولا وحده", "ولا واحد", "ما عندي", "ماعندي", "ما في", "مافي", "لا يوجد", "سليمه", "كله تمام",
  "none", "none of these", "no", "nope", "nothing", "all good", "not pregnant",
].map(normalizeText);

export const INTENT_LEXICON = fold<Intent>({
  book: [
    "احجز", "حجز", "ابي احجز", "ابغى احجز", "ابغا احجز", "ودي احجز", "حجزلي", "احجزلي", "موعد", "ابي موعد", "ابغى موعد", "مواعيد متاحه",
    "book", "booking", "appointment", "schedule", "reserve", "reservation", "slot", "slots",
  ],
  callback: [
    "اتصلوا", "اتصلو", "اتصلي", "كلموني", "كلموني", "اتصال", "يتصل", "تتصلون", "اتصلوا علي", "دقوا علي", "رنوا",
    "call me", "call back", "callback", "phone call", "ring me", "give me a call",
  ],
  human: [
    "موظفه", "موظف", "انسان", "احد من الفريق", "اكلم احد", "ابي اكلم", "ابغى اكلم", "خدمه العملاء", "الاداره",
    "human", "agent", "real person", "representative", "someone", "talk to",
  ],
  whatsapp: ["واتس", "واتساب", "وتساب", "واتسب", "الواتس", "whatsapp", "whats app", "whatsap"],
  faq_hours: [
    "دوام", "الدوام", "دوامكم", "اوقات العمل", "اوقاتكم", "ساعات العمل", "تفتحون", "تفتحوا", "تقفلون", "تسكرون", "فاتحين",
    "مفتوحين", "مفتوح", "متى تفتح", "متى تقفل", "مسكرين",
    "hours", "opening", "open now", "are you open", "opening hours", "working hours", "closing", "close today", "when do you open", "when do you close",
  ],
  faq_location: [
    "وين", "وينكم", "موقع", "موقعكم", "مكانكم", "عنوان", "عنوانكم", "لوكيشن", "الخريطه", "خرائط", "اي حي", "الحي",
    "where", "location", "address", "directions", "map", "located", "find you",
  ],
  faq_price: [
    "سعر", "سعره", "سعرها", "اسعار", "الاسعار", "اسعاركم", "بكم", "كم السعر", "كم سعر", "تكلفه", "كم تكلف", "كم يكلف", "كم حقها", "كم قيمه",
    "price", "prices", "pricing", "cost", "costs", "how much", "fee", "fees", "rates",
  ],
  faq_giftcard: ["بطاقه هديه", "بطاقة هدية", "كرت هديه", "قسيمه", "قسيمة", "هديه", "اهدي", "gift card", "giftcard", "voucher", "gift"],
  faq_payment: [
    "دفع", "الدفع", "ادفع", "مدى", "فيزا", "ماستر", "ابل باي", "تابي", "تمارا", "اقساط", "تقسيط", "كاش",
    "pay", "payment", "apple pay", "credit card", "debit card", "visa", "mastercard", "installments", "instalments", "tabby", "tamara", "cash", "mada",
  ],
  faq_parking: ["مواقف", "موقف سيارات", "باركنق", "باركينج", "اوقف سيارتي", "parking", "park", "car park", "valet"],
  faq_duration: [
    "كم تاخذ", "كم تاخذ الجلسه", "مده الجلسه", "مدة الجلسة", "كم مده", "كم وقت", "وقت الجلسه", "كم ساعه",
    "how long", "duration", "session length", "how many minutes", "take long",
  ],
  greeting: ["هلا", "هلا والله", "مرحبا", "مرحبتين", "السلام عليكم", "سلام", "اهلين", "هاي", "hi", "hello", "hey", "salam", "good morning", "good evening"],
  thanks: ["شكرا", "شكراً", "مشكوره", "مشكورة", "يعطيك العافيه", "تسلمين", "thanks", "thank you", "thx", "appreciate"],
  yes: ["نعم", "ايه", "ايوه", "اي", "اكيد", "تمام", "طيب", "اوكي", "يب", "yes", "yeah", "yep", "sure", "ok", "okay"],
  no: ["لا", "لاء", "لا شكرا", "no", "nope", "nah", "no thanks"],
  skip: ["تخطي", "تجاوز", "ما ادري", "مدري", "مادري", "مو متاكده", "ما اعرف", "ماعرف", "بعدين", "skip", "not sure", "don't know", "dont know", "idk", "pass", "unsure"],
  restart: ["من جديد", "ابدا من جديد", "نبدا من جديد", "اعاده", "restart", "start over", "reset", "begin again"],
  recommend: [
    "وش تنصحين", "وش تنصحيني", "ايش تنصحين", "ايش يناسبني", "وش يناسبني", "وش الافضل", "انصحيني",
    "recommend", "recommendation", "suggest", "what's best", "whats best", "what do you suggest",
  ],
});

// Words that negate the following term ("مو حامل", "not pregnant").
export const NEGATIONS = ["مو", "ما", "ولا", "ولست", "مب", "مش", "لست", "غير", "مانيب", "ماني", "لا", "not", "no", "never", "isn't", "im not", "i'm not"].map(normalizeText);

// Verbs that mark a treatment as already tried ("جربت ريتينول", "used retinol")
// rather than asked about ("بكم الهيدرافيشل").
export const TRIED_VERBS = [
  "جربت", "جربنا", "استخدمت", "استخدم", "استعملت", "سويت", "اخذت", "كنت اخذ", "كنت استخدم", "رحت", "على",
  "tried", "used", "using", "use", "did", "had", "been on", "was on", "taking", "took",
].map(normalizeText);
