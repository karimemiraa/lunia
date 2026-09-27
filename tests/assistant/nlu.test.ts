import { describe, it, expect } from "vitest";
import { understandText } from "@/modules/assistant/nlu/rules";
import { normalizeText, sanitizeInput } from "@/modules/assistant/normalize";
import { extractPhone, normalizePhone, phoneVariants } from "@/modules/assistant/phone";
import { geminiExtract, createGeminiEngine } from "@/modules/assistant/nlu/gemini";

describe("normalizeText", () => {
  it("folds Arabic letter variants, diacritics, stretching and digits", () => {
    expect(normalizeText("أبغى بشرةٌ نضِرة")).toBe("ابغي بشره نضره");
    expect(normalizeText("حبووووب")).toBe("حبوب");
    expect(normalizeText("٠٥٥١٢٣٤٥٦٧")).toBe("0551234567");
    expect(normalizeText("Dark-Spots!!")).toBe("dark spots");
  });

  it("sanitizes control and invisible characters", () => {
    expect(sanitizeInput("hi​\u0000 there‮", 100)).toBe("hi there");
    expect(sanitizeInput("x".repeat(50), 10)).toHaveLength(10);
  });
});

describe("phones", () => {
  it("normalizes Saudi mobiles typed every way", () => {
    for (const raw of ["0551234567", "055 123 4567", "+966551234567", "00966551234567", "966551234567", "٠٥٥١٢٣٤٥٦٧", "551234567"]) {
      expect(normalizePhone(raw)).toBe("+966551234567");
    }
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+447911123456")).toBe("+447911123456");
  });

  it("finds a phone inside a sentence and lists stored spellings", () => {
    expect(extractPhone("رقمي ٠٥٥-١٢٣-٤٥٦٧ اتصلوا المسا")).toBe("+966551234567");
    expect(extractPhone("call me on 0551234567 please")).toBe("+966551234567");
    expect(extractPhone("I have had acne for 2 years")).toBeNull();
    expect(phoneVariants("+966551234567")).toContain("0551234567");
  });
});

describe("rule-based understanding (Arabic)", () => {
  it("extracts a full profile from one colloquial sentence", () => {
    const u = understandText("عندي حبوب وتصبغات من سنة وأبغى بشرتي تصفى قبل زواجي");
    expect(u.concerns).toEqual(expect.arrayContaining(["acne", "pigmentation"]));
    expect(u.durationMonths).toBe(12);
    expect(u.goals).toContain("clear_skin");
    expect(u.event).toBe("wedding");
    expect(u.areas).toContain("face");
  });

  it("understands Saudi spellings for hair and post-surgery", () => {
    const hair = understandText("شعري يطيح كثير من شهرين");
    expect(hair.concerns).toEqual(["hair_loss"]);
    expect(hair.areas).toEqual(["scalp"]);
    expect(hair.durationMonths).toBe(2);

    const surgery = understandText("سويت شفط دهون وعندي تورم");
    expect(surgery.concerns).toContain("post_surgery");
    expect(surgery.concerns).not.toContain("oiliness");
  });

  it("reads timelines separately from durations", () => {
    const u = understandText("زواجي بعد شهرين وعندي كلف");
    expect(u.concerns).toContain("pigmentation");
    expect(u.timelineWeeks).toBe(9);
    expect(u.durationMonths).toBeUndefined();
  });

  it("flags contraindications and respects negation", () => {
    expect(understandText("انا حامل بالشهر الرابع").contraindications).toContain("pregnant");
    const negated = understandText("مو حامل ولا مرضع");
    expect(negated.contraindications).toEqual([]);
    expect(understandText("سويت ليزر قبل اسبوع").contraindications).toContain("recent_procedure");
    const allergy = understandText("عندي حساسية من العطور");
    expect(allergy.contraindications).toEqual(["allergies"]);
    expect(allergy.concerns).not.toContain("sensitivity");
  });

  it("detects skin type only when talking about skin type", () => {
    expect(understandText("بشرتي دهنية ومساماتي واسعه").skinType).toBe("oily");
    expect(understandText("دهنية", { expecting: "skin_type" }).skinType).toBe("oily");
    expect(understandText("فروة راسي جافه").skinType).toBeUndefined();
  });

  it("recognizes intents", () => {
    expect(understandText("متى تفتحون؟").intents).toContain("faq_hours");
    expect(understandText("بكم الهيدرافيشل").intents).toContain("faq_price");
    expect(understandText("وين موقعكم").intents).toContain("faq_location");
    expect(understandText("ابي احجز موعد").intents).toContain("book");
    expect(understandText("ابي اكلم احد").intents).toContain("human");
    expect(understandText("كلموني واتساب").intents).toContain("whatsapp");
    expect(understandText("فيه مواقف؟").intents).toContain("faq_parking");
  });

  it("only counts treatments as tried when they were tried", () => {
    expect(understandText("بكم الهيدرافيشل").previousTreatments).toEqual([]);
    expect(understandText("جربت ريتينول وكريمات").previousTreatments).toEqual(expect.arrayContaining(["retinol", "creams"]));
    expect(understandText("ما جربت شي", { expecting: "tried" }).triedNothing).toBe(true);
  });

  it("captures names, phones and codes", () => {
    expect(understandText("اسمي نورة العتيبي").name).toBe("نورة العتيبي");
    expect(understandText("سارة", { expecting: "name" }).name).toBe("سارة");
    expect(understandText("احجز", { expecting: "name" }).name).toBeUndefined();
    expect(understandText("رقمي 0551234567").phone).toBe("+966551234567");
    expect(understandText("١٢٣ ٤٥٦", { expecting: "code" }).code).toBe("123456");
  });
});

describe("rule-based understanding (English, typos)", () => {
  it("handles plain English", () => {
    const u = understandText("I have had acne for 2 years and some dark spots");
    expect(u.concerns).toEqual(expect.arrayContaining(["acne", "pigmentation"]));
    expect(u.durationMonths).toBe(24);
  });

  it("tolerates common typos", () => {
    const u = understandText("pimpels and pigmintation, wedding in 6 weeks");
    expect(u.concerns).toEqual(expect.arrayContaining(["acne", "pigmentation"]));
    expect(u.event).toBe("wedding");
    expect(u.timelineWeeks).toBe(6);
    expect(understandText("wrinkels around my eyes").concerns).toContain("aging");
    expect(understandText("my hair is thining").concerns).toContain("hair_loss");
  });

  it("uses the nearest marker to tell duration from timeline", () => {
    expect(understandText("breakouts in the last year").durationMonths).toBe(12);
    expect(understandText("my engagement is in 3 weeks").timelineWeeks).toBe(3);
  });

  it("flags safety items and FAQ intents", () => {
    expect(understandText("I'm pregnant, is that ok?").contraindications).toContain("pregnant");
    expect(understandText("I'm not pregnant").contraindications).toEqual([]);
    expect(understandText("none of these", { expecting: "safety" }).noContraindications).toBe(true);
    expect(understandText("what are your opening hours").intents).toContain("faq_hours");
    expect(understandText("how much is a peel").intents).toContain("faq_price");
    expect(understandText("do you sell gift cards").intents).toContain("faq_giftcard");
    expect(understandText("can I talk to a real person").intents).toContain("human");
  });
});

describe("Gemini adapter", () => {
  it("merges validated model output on top of the rules", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ concerns: ["dullness", "not_a_concern"], goals: ["glow"], skinType: "dry" }) }] } }],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const engine = createGeminiEngine({ apiKey: "test", fetchImpl });
    const u = await engine.understand("عندي حبوب");
    expect(u.concerns).toEqual(["acne", "dullness"]);
    expect(u.goals).toEqual(["glow"]);
  });

  it("falls back to rules on failure and never sends contact steps", async () => {
    let called = 0;
    const failing = (async () => {
      called++;
      return new Response("nope", { status: 500 });
    }) as unknown as typeof fetch;
    expect(await geminiExtract("hi", {}, { apiKey: "k", fetchImpl: failing })).toBeNull();
    const engine = createGeminiEngine({ apiKey: "k", fetchImpl: failing });
    const u = await engine.understand("acne");
    expect(u.concerns).toEqual(["acne"]);
    called = 0;
    await engine.understand("0551234567", { expecting: "phone" });
    expect(called).toBe(0);
  });
});
