import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ALL_PERMISSION_KEYS, ROLE_PERMISSIONS } from "../src/modules/iam/permissions";
import type {
  BusinessSettings,
  HoursSettings,
  SocialSettings,
  SeoSettings,
  HeroSettings,
} from "../src/modules/cms/settings";
import bcrypt from "bcryptjs";

// Prisma 7 removed the `url` field from the schema's datasource block and
// requires a driver adapter to be passed to the PrismaClient constructor
// (mirrors src/lib/db.ts). We load .env ourselves since this script runs
// outside of Next.js.
try {
  process.loadEnvFile();
} catch {
  // No .env file present (e.g. in CI where vars are injected directly) — ignore.
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.location.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", name: "Lunia Riyadh", isDefault: true },
  });

  for (const key of ALL_PERMISSION_KEYS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  const roleNames: Record<string, string> = {
    owner: "Owner",
    manager: "Manager",
    reception: "Reception",
    specialist: "Specialist",
    marketing: "Marketing",
    client: "Client",
  };
  for (const [key, name] of Object.entries(roleNames)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: {},
      create: { key, name, isSystem: true },
    });
    const perms = ROLE_PERMISSIONS[key] ?? [];
    for (const pkey of perms) {
      const perm = await prisma.permission.findUnique({ where: { key: pkey } });
      if (perm) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
    }
  }

  // minPoints drives loyalty auto-tier upgrades (applyAutoTier in
  // src/modules/crm/loyalty.ts): a client is auto-set to the highest tier
  // whose minPoints <= their points balance (1 point per 100 minor currency
  // units spent -- see EARN_DIVISOR). guest/member/vip form the actual
  // points ladder; bride/postsurgery are staff-assigned program tiers, not
  // loyalty ranks, so their minPoints is set unreachably high (below Int's
  // ~2.1B ceiling) so points earning never auto-assigns/overwrites them.
  const tiers = [
    { key: "guest", name: "Guest", priority: 0, discountPct: 0, minPoints: 0 },
    { key: "member", name: "Member", priority: 10, discountPct: 5, minPoints: 500 },
    { key: "vip", name: "VIP", priority: 20, discountPct: 10, minPoints: 2000 },
    { key: "bride", name: "Bride Program", priority: 15, discountPct: 0, minPoints: 999_999_900 },
    { key: "postsurgery", name: "Post-Surgery Program", priority: 15, discountPct: 0, minPoints: 999_999_901 },
  ];
  for (const t of tiers) {
    await prisma.membershipTier.upsert({
      where: { key: t.key },
      // Only minPoints is kept in sync on re-seed (this is its first
      // population) -- name/priority/discountPct are left alone in case an
      // admin has since edited them via the tiers UI.
      update: { minPoints: t.minPoints },
      create: { ...t, isSystem: true },
    });
  }

  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local";
  const ownerPass = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: "owner" } });
  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      type: "STAFF",
      email: ownerEmail,
      passwordHash: await bcrypt.hash(ownerPass, 12),
      locale: "en",
      staffProfile: { create: { fullName: "Lunia Owner", title: "Founder" } },
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: ownerRole.id } },
    update: {},
    create: { userId: user.id, roleId: ownerRole.id },
  });
  const openHours = { open: "10:00", close: "22:00", closed: false };
  const closedHours = { open: "10:00", close: "22:00", closed: true };
  const defaultSettings: Record<string, unknown> = {
    business: {
      nameEn: "Lunia",
      nameAr: "لونيا",
      addressEn: "King Fahd Road, Riyadh, Saudi Arabia",
      addressAr: "طريق الملك فهد، الرياض، المملكة العربية السعودية",
      phone: "+9665XXXXXXXX",
      whatsapp: "+9665XXXXXXXX",
      email: "hello@lunia.example",
    } satisfies BusinessSettings,
    hours: {
      sun: openHours,
      mon: openHours,
      tue: openHours,
      wed: openHours,
      thu: openHours,
      fri: closedHours,
      sat: openHours,
    } satisfies HoursSettings,
    social: {
      instagram: "@lunia",
    } satisfies SocialSettings,
    seo: {
      defaultTitleEn: "Lunia — Skin Quality Center",
      defaultTitleAr: "لونيا — مركز جودة البشرة",
      defaultDescEn: "Lunia is a premium skin quality center in Riyadh offering advanced, personalized skincare treatments.",
      defaultDescAr: "لونيا مركز متميز لجودة البشرة في الرياض يقدم علاجات عناية بالبشرة متقدمة ومخصصة.",
    } satisfies SeoSettings,
    hero: {
      mediaId: null,
      headlineEn: "Where natural beauty begins",
      headlineAr: "حيث يبدأ الجمال الطبيعي",
      ctaEn: "Book Now",
      ctaAr: "احجزي الآن",
    } satisfies HeroSettings,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as object },
    });
  }

  // --- Catalog: Departments, Services, Brands, BlogPosts -------------------
  // Content sourced from the Lunia Strategic Foundation. Arabic copy is a
  // faithful Gulf-Arabic translation; both are seeded placeholders that
  // content owners can refine later via the admin CMS.
  type ServiceSeed = {
    slug: string;
    nameEn: string;
    nameAr: string;
    summaryEn: string;
    summaryAr: string;
    benefitsEn: string[];
    benefitsAr: string[];
    order: number;
  };

  type DepartmentSeed = {
    slug: string;
    nameEn: string;
    nameAr: string;
    taglineEn: string;
    taglineAr: string;
    descEn: string;
    descAr: string;
    order: number;
    services: ServiceSeed[];
  };

  const departmentSeeds: DepartmentSeed[] = [
    {
      slug: "skin",
      nameEn: "Skin Quality",
      nameAr: "جودة البشرة",
      taglineEn: "Korean-inspired care for healthy, resilient skin",
      taglineAr: "عناية مستوحاة من الفلسفة الكورية لبشرة صحية ومتينة",
      descEn:
        "Lunia's Skin Quality department follows the Korean philosophy of building healthy skin from the inside out, rather than masking concerns. Every visit begins with a diagnostic analysis so treatments are matched to your skin's real needs, then layered over time to improve texture, hydration, and resilience.",
      descAr:
        "يعتمد قسم جودة البشرة في لونيا الفلسفة الكورية في بناء بشرة صحية من الأساس بدلاً من إخفاء المشكلات السطحية. تبدأ كل زيارة بتحليل تشخيصي دقيق لتحديد احتياجات بشرتك الفعلية، ثم تُبنى العلاجات تدريجياً لتحسين ملمس البشرة وترطيبها ومتانتها.",
      order: 0,
      services: [
        {
          slug: "diagnostic-skin-analysis",
          nameEn: "Diagnostic Skin Analysis",
          nameAr: "تحليل تشخيصي للبشرة",
          summaryEn:
            "An in-depth assessment of your skin's hydration, texture, and underlying concerns using professional imaging, forming the baseline for every treatment plan at Lunia.",
          summaryAr:
            "تقييم دقيق لمستوى ترطيب بشرتك وملمسها والمشكلات الكامنة فيها باستخدام تقنيات تصوير احترافية، ليكون الأساس لخطة العلاج الخاصة بك في لونيا.",
          benefitsEn: [
            "Identifies hydration, pigmentation, and texture concerns before treatment",
            "Builds a personalized, evolving treatment plan",
            "Tracks visible progress across visits",
          ],
          benefitsAr: [
            "يحدد مشكلات الترطيب والتصبغ والملمس قبل بدء العلاج",
            "يضع خطة علاجية شخصية تتطور مع الوقت",
            "يتابع التقدم الملحوظ عبر الزيارات",
          ],
          order: 0,
        },
        {
          slug: "signature-facials-hydrafacial",
          nameEn: "Signature Facials & HydraFacial",
          nameAr: "فيشل لونيا المميز وهيدرافيشل",
          summaryEn:
            "Deep cleansing, exfoliation, and hydration in a single session, customized to your skin analysis for an immediate, visible glow.",
          summaryAr:
            "تنظيف عميق وتقشير وترطيب في جلسة واحدة، مخصص وفق نتائج تحليل بشرتك لإشراقة فورية وملحوظة.",
          benefitsEn: [
            "Deep pore cleansing and gentle exfoliation",
            "Instant hydration and radiance",
            "Customizable to sensitivity and skin goals",
          ],
          benefitsAr: [
            "تنظيف عميق للمسام وتقشير لطيف",
            "ترطيب وإشراقة فورية",
            "قابل للتخصيص حسب حساسية البشرة وأهدافها",
          ],
          order: 1,
        },
        {
          slug: "led-light-therapy",
          nameEn: "LED Light Therapy",
          nameAr: "علاج الضوء LED",
          summaryEn:
            "Clinically studied red and blue light wavelengths that calm inflammation, support collagen renewal, and even out skin tone over a course of sessions.",
          summaryAr:
            "أطوال موجية من الضوء الأحمر والأزرق مدروسة سريرياً تهدئ الالتهاب وتدعم تجدد الكولاجين وتوحد لون البشرة عبر سلسلة من الجلسات.",
          benefitsEn: [
            "Calms redness and inflammation",
            "Supports natural collagen renewal",
            "Non-invasive with no downtime",
          ],
          benefitsAr: [
            "يهدئ الاحمرار والالتهاب",
            "يدعم تجدد الكولاجين الطبيعي",
            "غير جراحي ولا يتطلب فترة تعافي",
          ],
          order: 2,
        },
        {
          slug: "microdermabrasion-peels",
          nameEn: "Microdermabrasion & Peels",
          nameAr: "التقشير الكريستالي والكيميائي",
          summaryEn:
            "Resurfacing treatments that remove dull, damaged surface layers to reveal smoother, more even-toned skin, calibrated to your diagnostic results.",
          summaryAr:
            "علاجات تجديد سطحي تزيل الطبقات الباهتة والمتضررة لتكشف عن بشرة أنعم وأكثر توحداً في اللون، وتُعاير وفق نتائج تحليلك التشخيصي.",
          benefitsEn: [
            "Smooths texture and refines pores",
            "Fades dullness and uneven tone",
            "Levels calibrated to your skin's tolerance",
          ],
          benefitsAr: [
            "ينعّم الملمس ويقلص المسام",
            "يقلل من الباهتان وتفاوت لون البشرة",
            "درجات معايرة وفق تحمل بشرتك",
          ],
          order: 3,
        },
      ],
    },
    {
      slug: "hair-scalp",
      nameEn: "Hair & Scalp",
      nameAr: "الشعر وفروة الرأس",
      taglineEn: "Treating the scalp as an extension of skin quality",
      taglineAr: "نعتني بفروة الرأس كامتداد لجودة البشرة",
      descEn:
        "Lunia treats the scalp as skin — because healthy hair starts with a healthy scalp. Our Hair & Scalp department combines diagnostic analysis with detox, stimulation, and therapy protocols designed to restore balance and support long-term hair health.",
      descAr:
        "تتعامل لونيا مع فروة الرأس كجزء من البشرة، لأن الشعر الصحي يبدأ من فروة رأس صحية. يجمع قسم الشعر وفروة الرأس بين التحليل التشخيصي وبروتوكولات إزالة السموم والتحفيز والعلاج لاستعادة التوازن ودعم صحة الشعر على المدى الطويل.",
      order: 1,
      services: [
        {
          slug: "scalp-diagnostic-analysis",
          nameEn: "Scalp Diagnostic Analysis",
          nameAr: "تحليل تشخيصي لفروة الرأس",
          summaryEn:
            "A magnified assessment of scalp condition, follicle density, and oil balance that guides every subsequent hair and scalp treatment.",
          summaryAr:
            "تقييم مكبّر لحالة فروة الرأس وكثافة البصيلات وتوازن الزيوت، يوجه كل علاجات الشعر وفروة الرأس اللاحقة.",
          benefitsEn: [
            "Reveals follicle density and scalp condition",
            "Detects early signs of imbalance",
            "Guides a personalized scalp care plan",
          ],
          benefitsAr: [
            "يكشف كثافة البصيلات وحالة فروة الرأس",
            "يرصد العلامات المبكرة لاختلال التوازن",
            "يوجه خطة عناية شخصية بفروة الرأس",
          ],
          order: 0,
        },
        {
          slug: "led-lllt-cap-therapy",
          nameEn: "LED / LLLT Cap Therapy",
          nameAr: "علاج القبعة الضوئية LLLT",
          summaryEn:
            "Low-level laser therapy delivered via a fitted cap to stimulate follicles and support healthier, fuller-looking hair over a course of sessions.",
          summaryAr:
            "علاج بالليزر منخفض الطاقة يُقدَّم عبر قبعة مخصصة لتحفيز البصيلات ودعم مظهر شعر أكثر صحة وكثافة عبر سلسلة من الجلسات.",
          benefitsEn: [
            "Stimulates follicles non-invasively",
            "Supports thicker, healthier-looking hair",
            "Comfortable, downtime-free sessions",
          ],
          benefitsAr: [
            "يحفز البصيلات دون تدخل جراحي",
            "يدعم مظهر شعر أكثر كثافة وصحة",
            "جلسات مريحة بلا فترة تعافي",
          ],
          order: 1,
        },
        {
          slug: "scalp-detox",
          nameEn: "Scalp Detox",
          nameAr: "إزالة سموم فروة الرأس",
          summaryEn:
            "A deep-cleansing treatment that clears product buildup and excess oil, giving follicles a clean environment to function at their best.",
          summaryAr:
            "علاج تنظيف عميق يزيل تراكم المنتجات والزيوت الزائدة، ليمنح البصيلات بيئة نظيفة للعمل بأفضل حال.",
          benefitsEn: [
            "Clears buildup and excess oil",
            "Refreshes the scalp environment",
            "Prepares the scalp for follow-up therapies",
          ],
          benefitsAr: [
            "يزيل التراكمات والزيوت الزائدة",
            "ينعش بيئة فروة الرأس",
            "يهيئ فروة الرأس للعلاجات التالية",
          ],
          order: 2,
        },
        {
          slug: "scalp-massage-oxygen",
          nameEn: "Scalp Massage & Oxygen Therapy",
          nameAr: "تدليك فروة الرأس والعلاج بالأكسجين",
          summaryEn:
            "A relaxing therapeutic massage paired with oxygenating treatment to boost circulation and nourish follicles from the root.",
          summaryAr:
            "تدليك علاجي مريح مقترن بعلاج مؤكسج لتعزيز الدورة الدموية وتغذية البصيلات من الجذور.",
          benefitsEn: [
            "Improves scalp circulation",
            "Deeply relaxing experience",
            "Nourishes follicles from the root",
          ],
          benefitsAr: [
            "يحسن الدورة الدموية في فروة الرأس",
            "تجربة استرخاء عميقة",
            "يغذي البصيلات من الجذور",
          ],
          order: 3,
        },
      ],
    },
    {
      slug: "post-surgery",
      nameEn: "Post-Surgery Recovery",
      nameAr: "التعافي بعد الجراحة",
      taglineEn: "Supportive care for a smoother, faster recovery",
      taglineAr: "عناية داعمة لتعافٍ أسرع وأكثر سلاسة",
      descEn:
        "Lunia's Post-Surgery Recovery department supports clients after cosmetic and medical procedures with lymphatic drainage, pressotherapy, and guided compression care in a calm, dedicated recovery lounge — helping reduce swelling and discomfort while promoting healthy healing.",
      descAr:
        "يدعم قسم التعافي بعد الجراحة في لونيا العميلات بعد الإجراءات التجميلية والطبية من خلال التصريف اللمفاوي والعلاج بالضغط الهوائي وإرشادات ملابس الضغط، في صالة تعافٍ هادئة ومخصصة تساعد على تقليل التورم والانزعاج وتعزيز الشفاء الصحي.",
      order: 2,
      services: [
        {
          slug: "manual-lymphatic-drainage",
          nameEn: "Manual Lymphatic Drainage",
          nameAr: "التصريف اللمفاوي اليدوي",
          summaryEn:
            "A gentle, specialized massage technique that encourages fluid movement to reduce post-surgical swelling and support the body's natural healing process.",
          summaryAr:
            "تقنية تدليك لطيفة ومتخصصة تحفز حركة السوائل لتقليل التورم بعد الجراحة ودعم عملية الشفاء الطبيعية للجسم.",
          benefitsEn: [
            "Reduces post-surgical swelling",
            "Supports the body's natural healing",
            "Gentle and specialist-guided",
          ],
          benefitsAr: [
            "يقلل التورم بعد الجراحة",
            "يدعم الشفاء الطبيعي للجسم",
            "لطيف ويُقدَّم بإشراف متخصص",
          ],
          order: 0,
        },
        {
          slug: "pressotherapy",
          nameEn: "Pressotherapy",
          nameAr: "العلاج بالضغط الهوائي",
          summaryEn:
            "Sequential air-compression therapy that improves circulation and helps move excess fluid out of treated areas during recovery.",
          summaryAr:
            "علاج بالضغط الهوائي المتسلسل يحسن الدورة الدموية ويساعد على تصريف السوائل الزائدة من المناطق المعالجة أثناء التعافي.",
          benefitsEn: [
            "Improves circulation during recovery",
            "Helps reduce fluid retention",
            "Comfortable, guided sessions",
          ],
          benefitsAr: [
            "يحسن الدورة الدموية أثناء التعافي",
            "يساعد على تقليل احتباس السوائل",
            "جلسات مريحة بإشراف متخصص",
          ],
          order: 1,
        },
        {
          slug: "compression-garment-guidance",
          nameEn: "Compression Garment Guidance",
          nameAr: "إرشادات ملابس الضغط",
          summaryEn:
            "Expert fitting and guidance on compression garments to support proper healing, comfort, and results after your procedure.",
          summaryAr:
            "تركيب وإرشاد متخصص لملابس الضغط لدعم التعافي السليم والراحة والنتائج المرجوة بعد إجرائك.",
          benefitsEn: [
            "Ensures a correct, comfortable fit",
            "Supports healing and final results",
            "Personalized guidance from specialists",
          ],
          benefitsAr: [
            "يضمن تركيباً صحيحاً ومريحاً",
            "يدعم التعافي والنتائج النهائية",
            "إرشاد شخصي من المتخصصين",
          ],
          order: 2,
        },
        {
          slug: "recovery-lounge",
          nameEn: "Recovery Lounge",
          nameAr: "صالة التعافي",
          summaryEn:
            "A calm, dedicated space to rest between treatments, designed for privacy and comfort during your post-surgical recovery journey.",
          summaryAr:
            "مساحة هادئة ومخصصة للراحة بين العلاجات، مصممة للخصوصية والراحة خلال رحلة تعافيك بعد الجراحة.",
          benefitsEn: [
            "Private, comfortable rest space",
            "Designed for post-procedure calm",
            "Part of a seamless recovery journey",
          ],
          benefitsAr: [
            "مساحة راحة خاصة ومريحة",
            "مصممة لتهدئة ما بعد الإجراء",
            "جزء من رحلة تعافٍ متكاملة",
          ],
          order: 3,
        },
      ],
    },
  ];

  for (const dept of departmentSeeds) {
    const { services, ...deptData } = dept;
    const createdDept = await prisma.department.upsert({
      where: { slug: dept.slug },
      update: deptData,
      create: deptData,
    });
    for (const svc of services) {
      const { slug, ...svcData } = svc;
      await prisma.service.upsert({
        where: { slug },
        update: { ...svcData, departmentId: createdDept.id },
        create: { slug, ...svcData, departmentId: createdDept.id },
      });
    }
  }

  const brandSeeds = [
    {
      slug: "zo-skin-health",
      name: "ZO Skin Health",
      descEn:
        "A physician-developed skincare line founded by Dr. Zein Obagi, built on therapeutic, results-driven formulations for long-term skin health.",
      descAr:
        "خط عناية بالبشرة طوره أطباء بقيادة الدكتور زين عبقري، ويعتمد على تركيبات علاجية تركز على النتائج لصحة بشرة طويلة الأمد.",
      whyChosenEn:
        "Lunia chose ZO Skin Health for its clinically backed, physician-grade approach that complements our diagnostic-first philosophy.",
      whyChosenAr:
        "اختارت لونيا ZO Skin Health لنهجها الطبي المدعوم سريرياً الذي يكمل فلسفتنا القائمة على التشخيص أولاً.",
      order: 0,
    },
    {
      slug: "pca",
      name: "PCA",
      descEn:
        "A trusted professional skincare and peel brand known for science-based formulations that address a wide range of skin concerns.",
      descAr:
        "علامة موثوقة في العناية بالبشرة والتقشير المهني، معروفة بتركيباتها العلمية التي تعالج مجموعة واسعة من مشكلات البشرة.",
      whyChosenEn:
        "We chose PCA for its versatile, well-tolerated peel systems that pair naturally with our resurfacing treatments.",
      whyChosenAr:
        "اخترنا PCA لأنظمة التقشير المتعددة الاستخدامات والمتحملة جيداً والتي تتكامل بشكل طبيعي مع علاجات التجديد لدينا.",
      order: 1,
    },
    {
      slug: "image-skincare",
      name: "Image Skincare",
      descEn:
        "A comprehensive skincare range offering targeted solutions for hydration, brightening, and anti-aging concerns.",
      descAr:
        "مجموعة شاملة من منتجات العناية بالبشرة تقدم حلولاً مستهدفة للترطيب والتفتيح ومكافحة علامات التقدم في السن.",
      whyChosenEn:
        "Image Skincare rounds out our protocols with accessible, effective formulations suited to a wide range of skin types.",
      whyChosenAr:
        "تكمّل Image Skincare بروتوكولاتنا بتركيبات فعالة وسهلة الاستخدام تناسب مجموعة واسعة من أنواع البشرة.",
      order: 2,
    },
    {
      slug: "eltamd",
      name: "EltaMD",
      descEn:
        "A dermatologist-recommended sun care brand known for lightweight, broad-spectrum sunscreens suited to sensitive and treated skin.",
      descAr:
        "علامة موصى بها من أطباء الجلدية للعناية بالشمس، معروفة بواقيات شمس خفيفة وواسعة الطيف تناسب البشرة الحساسة والمعالَجة.",
      whyChosenEn:
        "Sun protection is central to skin quality, and EltaMD gives our clients a comfortable daily option after in-clinic treatments.",
      whyChosenAr:
        "الحماية من الشمس أساسية لجودة البشرة، وتمنح EltaMD عميلاتنا خياراً يومياً مريحاً بعد العلاجات داخل العيادة.",
      order: 3,
    },
    {
      slug: "72-hair",
      name: "72 Hair",
      descEn:
        "A specialized hair and scalp care brand offering targeted formulations that support scalp balance and healthier-looking hair.",
      descAr:
        "علامة متخصصة في العناية بالشعر وفروة الرأس تقدم تركيبات مستهدفة تدعم توازن فروة الرأس ومظهر شعر أكثر صحة.",
      whyChosenEn:
        "72 Hair aligns with our scalp-as-skin philosophy, extending in-clinic results with at-home scalp care.",
      whyChosenAr:
        "تتماشى 72 Hair مع فلسفتنا في التعامل مع فروة الرأس كامتداد للبشرة، وتمد نتائج العيادة بعناية منزلية لفروة الرأس.",
      order: 4,
    },
  ];

  for (const brand of brandSeeds) {
    const { slug, ...brandData } = brand;
    await prisma.brand.upsert({
      where: { slug },
      update: brandData,
      create: { slug, ...brandData },
    });
  }

  const blogPostSeeds = [
    {
      slug: "the-korean-philosophy-of-skin-quality",
      titleEn: "The Korean Philosophy of Skin Quality",
      titleAr: "الفلسفة الكورية في جودة البشرة",
      excerptEn:
        "Why Lunia builds every treatment plan around long-term skin health rather than quick fixes — and what that means for your first visit.",
      excerptAr:
        "لماذا تبني لونيا كل خطة علاجية على أساس صحة البشرة طويلة الأمد بدلاً من الحلول السريعة، وماذا يعني ذلك لزيارتك الأولى.",
      bodyEn:
        "In Korea, skincare is treated as a long-term investment in skin health rather than a search for instant transformation. At Lunia, we bring that same philosophy to Riyadh: every client begins with a diagnostic skin analysis, and treatments are layered gradually to strengthen the skin barrier, improve hydration, and build resilience over time. The goal isn't to mask a concern for a day — it's to improve the quality of your skin for years to come.",
      bodyAr:
        "في كوريا، يُنظر إلى العناية بالبشرة كاستثمار طويل الأمد في صحتها وليس بحثاً عن تحول فوري. في لونيا، نجلب هذه الفلسفة نفسها إلى الرياض: تبدأ كل عميلة بتحليل تشخيصي لبشرتها، وتُبنى العلاجات تدريجياً لتقوية حاجز البشرة وتحسين الترطيب وبناء المتانة مع الوقت. الهدف ليس إخفاء مشكلة ليوم واحد، بل تحسين جودة بشرتك لسنوات قادمة.",
      authorName: "Lunia Editorial Team",
      publishedAt: new Date("2026-08-01T09:00:00.000Z"),
      isPublished: true,
      order: 0,
    },
    {
      slug: "understanding-your-skin-analysis",
      titleEn: "Understanding Your Skin Analysis",
      titleAr: "فهم تحليل بشرتك",
      excerptEn:
        "A look at what happens during your first diagnostic visit at Lunia, and how the results shape every treatment that follows.",
      excerptAr:
        "نظرة على ما يحدث خلال زيارتك التشخيصية الأولى في لونيا، وكيف تشكّل النتائج كل علاج يليها.",
      bodyEn:
        "Every treatment journey at Lunia starts with a diagnostic skin analysis using professional imaging to assess hydration, texture, pigmentation, and underlying concerns beneath the surface. Rather than guessing, our specialists use this data to build a plan tailored specifically to your skin — and to track real, measurable progress at every follow-up visit. It's the foundation that makes every subsequent treatment more effective.",
      bodyAr:
        "تبدأ كل رحلة علاجية في لونيا بتحليل تشخيصي للبشرة باستخدام تقنيات تصوير احترافية لتقييم الترطيب والملمس والتصبغ والمشكلات الكامنة تحت السطح. وبدلاً من التخمين، يستخدم أخصائيونا هذه البيانات لبناء خطة مخصصة لبشرتك تحديداً، ولمتابعة تقدم حقيقي وقابل للقياس في كل زيارة متابعة. إنه الأساس الذي يجعل كل علاج لاحق أكثر فعالية.",
      authorName: "Lunia Editorial Team",
      publishedAt: new Date("2026-08-15T09:00:00.000Z"),
      isPublished: true,
      order: 1,
    },
    {
      slug: "caring-for-your-skin-after-surgery",
      titleEn: "Caring for Your Skin After Surgery",
      titleAr: "العناية ببشرتك بعد الجراحة",
      excerptEn:
        "What to expect from lymphatic drainage and pressotherapy, and how a supportive recovery routine can ease the healing process.",
      excerptAr:
        "ماذا تتوقعين من التصريف اللمفاوي والعلاج بالضغط الهوائي، وكيف يمكن لروتين تعافٍ داعم أن يسهّل عملية الشفاء.",
      bodyEn:
        "Recovery after a cosmetic or medical procedure is as important as the procedure itself. At Lunia, our Post-Surgery Recovery department combines manual lymphatic drainage, pressotherapy, and expert compression-garment guidance to help reduce swelling, ease discomfort, and support the body's natural healing timeline — all within a calm, dedicated recovery lounge designed for your comfort and privacy.",
      bodyAr:
        "التعافي بعد إجراء تجميلي أو طبي لا يقل أهمية عن الإجراء نفسه. في لونيا، يجمع قسم التعافي بعد الجراحة بين التصريف اللمفاوي اليدوي والعلاج بالضغط الهوائي وإرشادات خبيرة لملابس الضغط للمساعدة في تقليل التورم وتخفيف الانزعاج ودعم مسار الشفاء الطبيعي للجسم، وكل ذلك ضمن صالة تعافٍ هادئة ومخصصة لراحتك وخصوصيتك.",
      authorName: "Lunia Editorial Team",
      publishedAt: new Date("2026-08-28T09:00:00.000Z"),
      isPublished: true,
      order: 2,
    },
  ];

  for (const post of blogPostSeeds) {
    const { slug, ...postData } = post;
    await prisma.blogPost.upsert({
      where: { slug },
      update: postData,
      create: { slug, ...postData },
    });
  }

  // --- Booking: durations/prices, rooms, staff schedules, access rules ----
  // priceMinor is stored in halalas (SAR minor units): SAR * 100.
  const serviceBookingDetails: Record<
    string,
    { durationMin: number; priceMinorSar: number; inCenterOnly?: boolean }
  > = {
    "diagnostic-skin-analysis": { durationMin: 45, priceMinorSar: 250 },
    "signature-facials-hydrafacial": { durationMin: 60, priceMinorSar: 650 },
    "led-light-therapy": { durationMin: 30, priceMinorSar: 350 },
    "microdermabrasion-peels": { durationMin: 45, priceMinorSar: 500 },
    "scalp-diagnostic-analysis": { durationMin: 45, priceMinorSar: 250 },
    "led-lllt-cap-therapy": { durationMin: 30, priceMinorSar: 400 },
    "scalp-detox": { durationMin: 45, priceMinorSar: 350 },
    "scalp-massage-oxygen": { durationMin: 60, priceMinorSar: 450 },
    "manual-lymphatic-drainage": { durationMin: 60, priceMinorSar: 500, inCenterOnly: true },
    pressotherapy: { durationMin: 45, priceMinorSar: 400, inCenterOnly: true },
    "compression-garment-guidance": { durationMin: 30, priceMinorSar: 250, inCenterOnly: true },
    "recovery-lounge": { durationMin: 90, priceMinorSar: 1200, inCenterOnly: true },
  };
  for (const [slug, details] of Object.entries(serviceBookingDetails)) {
    await prisma.service.update({
      where: { slug },
      data: {
        durationMin: details.durationMin,
        priceMinor: details.priceMinorSar * 100,
        inCenterOnly: details.inCenterOnly ?? false,
      },
    });
  }

  const roomSeeds = [
    { name: "Treatment Room 1", capacity: 1, order: 0 },
    { name: "Treatment Room 2", capacity: 1, order: 1 },
    { name: "Recovery Lounge", capacity: 3, order: 2 },
  ];
  for (const room of roomSeeds) {
    const existing = await prisma.room.findFirst({ where: { name: room.name } });
    if (!existing) {
      await prisma.room.create({ data: room });
    }
  }

  const specialistEmail = process.env.SEED_SPECIALIST_EMAIL ?? "specialist@lunia.local";
  const specialistPass = process.env.SEED_SPECIALIST_PASSWORD ?? "ChangeMe123!";
  const specialistRole = await prisma.role.findUniqueOrThrow({ where: { key: "specialist" } });
  const specialist = await prisma.user.upsert({
    where: { email: specialistEmail },
    update: {},
    create: {
      type: "STAFF",
      email: specialistEmail,
      passwordHash: await bcrypt.hash(specialistPass, 12),
      locale: "en",
      staffProfile: { create: { fullName: "Lunia Specialist", title: "Skin & Scalp Specialist" } },
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: specialist.id, roleId: specialistRole.id } },
    update: {},
    create: { userId: specialist.id, roleId: specialistRole.id },
  });

  // Sun (0) - Thu (4), 10:00 (600 min) - 20:00 (1200 min), for both the
  // owner and the specialist.
  const scheduleWeekdays = [0, 1, 2, 3, 4];
  for (const staffUserId of [user.id, specialist.id]) {
    for (const weekday of scheduleWeekdays) {
      const existing = await prisma.staffSchedule.findFirst({ where: { staffUserId, weekday } });
      if (!existing) {
        await prisma.staffSchedule.create({
          data: { staffUserId, weekday, startMin: 600, endMin: 1200 },
        });
      } else {
        await prisma.staffSchedule.update({
          where: { id: existing.id },
          data: { startMin: 600, endMin: 1200, isActive: true },
        });
      }
    }
  }

  // Gate the premium HydraFacial service behind the VIP tier; everything
  // else remains open to all clients (no ServiceAccessRule row).
  const vipTier = await prisma.membershipTier.findUniqueOrThrow({ where: { key: "vip" } });
  const gatedService = await prisma.service.findUniqueOrThrow({
    where: { slug: "signature-facials-hydrafacial" },
  });
  await prisma.serviceAccessRule.upsert({
    where: { serviceId: gatedService.id },
    update: { minTierId: vipTier.id },
    create: { serviceId: gatedService.id, minTierId: vipTier.id },
  });

  // --- CampaignSpend: seed a couple of channels so CAC has data ------------
  function periodMonthOf(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const now = new Date();
  const currentPeriod = periodMonthOf(now);
  const priorPeriod = periodMonthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

  const campaignSpendSeeds = [
    { channel: "instagram", periodMonth: currentPeriod, amountMinor: 300000 },
    { channel: "google", periodMonth: currentPeriod, amountMinor: 150000 },
    { channel: "instagram", periodMonth: priorPeriod, amountMinor: 250000 },
  ];
  for (const spend of campaignSpendSeeds) {
    await prisma.campaignSpend.upsert({
      where: { channel_periodMonth: { channel: spend.channel, periodMonth: spend.periodMonth } },
      update: { amountMinor: spend.amountMinor },
      create: spend,
    });
  }

  // --- MessageTemplate: default bilingual comms templates ------------------
  // Mirrors src/modules/booking/outbox.ts's renderMessageBody() copy,
  // enriched with {{serviceName}}/{{dateTime}}/{{code}} placeholders.
  // src/modules/comms/templates.ts's renderTemplate() falls back to that
  // same static copy when no active row exists, so these seeded rows are the
  // *editable* defaults, not the only source of truth.
  type MessageTemplateSeed = {
    kind: string;
    locale: string;
    channel: string;
    bodyTemplate: string;
  };
  const messageTemplateSeeds: MessageTemplateSeed[] = [
    {
      kind: "CONFIRMATION",
      locale: "en",
      channel: "whatsapp",
      bodyTemplate: "Your Lunia booking for {{serviceName}} on {{dateTime}} is confirmed. We look forward to seeing you.",
    },
    {
      kind: "CONFIRMATION",
      locale: "ar",
      channel: "whatsapp",
      bodyTemplate: "تم تأكيد حجزك في لونيا لخدمة {{serviceName}} بتاريخ {{dateTime}}. نتطلع لرؤيتك قريباً.",
    },
    {
      kind: "REMINDER_24H",
      locale: "en",
      channel: "whatsapp",
      bodyTemplate: "Reminder: your Lunia appointment for {{serviceName}} is tomorrow at {{dateTime}}. See you soon!",
    },
    {
      kind: "REMINDER_24H",
      locale: "ar",
      channel: "whatsapp",
      bodyTemplate: "تذكير: موعدك في لونيا لخدمة {{serviceName}} غداً الساعة {{dateTime}}. نراك قريباً!",
    },
    {
      kind: "POST_VISIT",
      locale: "en",
      channel: "whatsapp",
      bodyTemplate: "Thank you for visiting Lunia for {{serviceName}}. We hope you had a great experience.",
    },
    {
      kind: "POST_VISIT",
      locale: "ar",
      channel: "whatsapp",
      bodyTemplate: "شكراً لزيارتك لونيا لخدمة {{serviceName}}. نتمنى أن تكون تجربتك ممتازة.",
    },
    {
      kind: "OTP",
      locale: "en",
      channel: "sms",
      bodyTemplate: "Your Lunia verification code is {{code}}.",
    },
    {
      kind: "OTP",
      locale: "ar",
      channel: "sms",
      bodyTemplate: "رمز التحقق الخاص بك في لونيا هو {{code}}.",
    },
  ];
  for (const tpl of messageTemplateSeeds) {
    await prisma.messageTemplate.upsert({
      where: { kind_locale_channel: { kind: tpl.kind, locale: tpl.locale, channel: tpl.channel } },
      update: { bodyTemplate: tpl.bodyTemplate },
      create: tpl,
    });
  }

  console.log("Seed complete. Owner:", ownerEmail);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
