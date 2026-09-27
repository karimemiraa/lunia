// Default consent-form templates, seeded on the first visit to
// /admin/clinical/consents when no templates exist. Written as plain,
// first-person statements the client signs; the center should have them
// reviewed by its medical director / legal advisor before relying on them.

export const CONSENT_KEYS = {
  GENERAL: "general-treatment",
  PHOTOGRAPHY: "photography",
  POST_SURGERY_DRAINAGE: "post-surgery-drainage",
} as const;

export interface ConsentTemplateDefault {
  key: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  /** Service slugs this form is required for (resolved to ids at seed time). */
  serviceSlugs: string[];
}

export const DEFAULT_CONSENT_TEMPLATES: ConsentTemplateDefault[] = [
  {
    key: CONSENT_KEYS.GENERAL,
    titleEn: "General treatment consent",
    titleAr: "الموافقة العامة على الجلسات",
    serviceSlugs: [],
    bodyEn: `I confirm that the information I have given in my health profile is complete and accurate to the best of my knowledge, and I will tell the Lunia team before each session if anything changes (for example a new medication, pregnancy, a recent procedure or a skin reaction).

The specialist has explained the treatment I am receiving, what it involves, the expected results and the common side effects, which can include temporary redness, sensitivity, swelling, dryness or changes in pigmentation. I understand that results vary from person to person and that no specific result is guaranteed.

I agree to follow the aftercare instructions I am given, including sun protection, and to contact the center if I notice anything unusual after a session.

I understand that the specialist may postpone or adjust a treatment if it is not suitable for me on the day, and that I can ask questions or withdraw my consent at any time before or during a session.

I consent to Lunia keeping my health profile and treatment records confidentially, for the purpose of providing my care, in line with the Personal Data Protection Law.`,
    bodyAr: `أقرّ بأن المعلومات التي قدّمتها في ملفي الصحي كاملة وصحيحة حسب علمي، وأتعهّد بإبلاغ فريق لونيا قبل كل جلسة بأي تغيير (مثل دواء جديد، أو حمل، أو إجراء حديث، أو تحسّس في البشرة).

وقد شرحت لي الأخصائية طبيعة الجلسة التي سأتلقاها وخطواتها والنتائج المتوقعة والآثار الجانبية الشائعة، والتي قد تشمل احمرارًا مؤقتًا أو حساسية أو تورّمًا أو جفافًا أو تغيّرًا في التصبّغ. وأدرك أن النتائج تختلف من شخص لآخر وأنه لا توجد نتيجة مضمونة.

وأوافق على الالتزام بتعليمات العناية بعد الجلسة، بما في ذلك الحماية من الشمس، والتواصل مع المركز إذا لاحظت أي أمر غير معتاد بعد الجلسة.

وأدرك أن للأخصائية تأجيل الجلسة أو تعديلها إذا لم تكن مناسبة لي في ذلك اليوم، وأن لي الحق في طرح الأسئلة أو سحب موافقتي في أي وقت قبل الجلسة أو أثناءها.

وأوافق على احتفاظ لونيا بملفي الصحي وسجلات جلساتي بسرية تامة لغرض تقديم الرعاية لي، وفقًا لنظام حماية البيانات الشخصية.`,
  },
  {
    key: CONSENT_KEYS.PHOTOGRAPHY,
    titleEn: "Clinical photography consent",
    titleAr: "الموافقة على التصوير السريري",
    serviceSlugs: [],
    bodyEn: `I agree that Lunia may take clinical photographs and skin-analysis images of the treated area before, during and after my treatments.

These images are part of my confidential treatment record. They are used only to plan my care and to track my progress, are stored securely, and are visible only to the Lunia clinical team.

My photographs will never be used for marketing, social media or any public purpose unless I give separate written permission for a specific use. I can withdraw this consent at any time by informing the center; images already taken remain part of my confidential record.`,
    bodyAr: `أوافق على أن تلتقط لونيا صورًا سريرية وصورًا لتحليل البشرة للمنطقة المعالَجة قبل الجلسات وأثناءها وبعدها.

تُعدّ هذه الصور جزءًا من سجلي العلاجي السري، وتُستخدم فقط لتخطيط رعايتي ومتابعة تقدّمي، وتُحفظ بشكل آمن، ولا يطّلع عليها إلا الفريق السريري في لونيا.

ولن تُستخدم صوري في التسويق أو وسائل التواصل الاجتماعي أو لأي غرض علني إلا بإذن كتابي مستقل مني لاستخدام محدد. ويحق لي سحب هذه الموافقة في أي وقت بإبلاغ المركز، مع بقاء الصور الملتقطة سابقًا ضمن سجلي السري.`,
  },
  {
    key: CONSENT_KEYS.POST_SURGERY_DRAINAGE,
    titleEn: "Post-surgery lymphatic drainage consent",
    titleAr: "الموافقة على جلسات التصريف اللمفاوي بعد العمليات",
    serviceSlugs: ["manual-lymphatic-drainage", "pressotherapy"],
    bodyEn: `I confirm that I have told the Lunia team the type and date of my surgery, the name of my surgeon, and any instructions my surgeon has given me, and that my surgeon has not advised against lymphatic drainage or compression therapy at this stage of my recovery.

I understand that post-surgery lymphatic drainage and pressotherapy are supportive recovery treatments. They are not a substitute for medical follow-up with my surgeon, and they do not treat complications.

I will tell the specialist before each session if I have a fever, increasing pain, redness, warmth, fluid leaking from a wound, shortness of breath, or pain or swelling in my leg. I understand that in these cases the session will not go ahead and I should contact my surgeon or seek medical care.

I understand that mild tenderness or tiredness after a session is common, and that the specialist will adapt pressure and technique to my comfort and my stage of healing.`,
    bodyAr: `أقرّ بأنني أبلغت فريق لونيا بنوع العملية وتاريخها واسم الجرّاح وأي تعليمات أعطاني إياها، وأن الجرّاح لم يمنع جلسات التصريف اللمفاوي أو العلاج بالضغط في هذه المرحلة من تعافيّ.

وأدرك أن التصريف اللمفاوي والعلاج بالضغط بعد العمليات جلسات داعمة للتعافي، وليست بديلًا عن المتابعة الطبية مع الجرّاح، ولا تعالج المضاعفات.

وأتعهّد بإبلاغ الأخصائية قبل كل جلسة إذا كانت لديّ حرارة، أو ألم متزايد، أو احمرار، أو سخونة، أو إفرازات من الجرح، أو ضيق في التنفس، أو ألم أو تورّم في الساق. وأدرك أن الجلسة لن تُجرى في هذه الحالات وأن عليّ التواصل مع الجرّاح أو طلب الرعاية الطبية.

وأدرك أن الشعور بألم خفيف أو تعب بعد الجلسة أمر شائع، وأن الأخصائية ستعدّل الضغط والتقنية بما يناسب راحتي ومرحلة التئامي.`,
  },
];
