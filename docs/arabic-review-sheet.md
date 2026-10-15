# Arabic review sheet: Phase 1 (customer-facing)

For a native Saudi reviewer. Every Arabic line changed in this release is listed beside its English and its previous Arabic. Mark anything that reads wrong in the **Reviewer** column, or edit it directly:
- **Website and account text:** edit `src/messages/ar.json` and ask the developer to ship it.
- **Message templates:** edit in Admin → Communications → Message templates.
- **Database content:** edit in the admin page named in Part C.

The rules behind every choice are in `docs/arabic-glossary.md`: Gulf dialect for the website, booking, account and messages; clear formal Arabic for the health questionnaire, consent forms and invoices; feminine address for customers.

**Lines I'm least sure of (please check first):**
- `home.hero.subhead` «علم حيوية البشرة والشعر.»: the English "architecture of skin vitality" is a brand line. Is there a phrase the team prefers?
- `home.heroStatement` «من هنا يبدأ جمالك الطبيعي»: changed from the more literal «حيث يبدأ الجمال الطبيعي».
- `contact.strip.directions.link` «وصّليني»: playful. «الاتجاهات» is the neutral option.
- `review.consentLabel` «موافقة إن لونيا تنشر تقييمي»: this is a consent, so does it need to be more formal?
- `book.stepper.completed` «(خلصت)»: screen-reader text for a finished step.

## Part A: Website, booking and account text (270 lines)

| Key | English | Before | Now | Reviewer |
|---|---|---|---|---|
| `nav.brands` | Brands | العلامات | العلامات التجارية | |
| `nav.primaryLabel` | Primary navigation | التنقل الرئيسي | القائمة الرئيسية | |
| `nav.mobileLabel` | Mobile navigation | قائمة التنقل للجوال | قائمة الجوال | |
| `common.skipToContent` | Skip to content | تخطي إلى المحتوى | انتقلي للمحتوى | |
| `common.logoLabel` | LUNIA — Skin & Hair | — (new) | لونيا — للبشرة والشعر | |
| `footer.navLabel` | Footer navigation | روابط التذييل | روابط أسفل الصفحة | |
| `home.heroStatement` | Where natural beauty begins | حيث يبدأ الجمال الطبيعي | من هنا يبدأ جمالك الطبيعي | |
| `home.hero.subhead` | The architecture of skin and hair vitality. | هندسة حيوية البشرة والشعر. | علم حيوية البشرة والشعر. | |
| `home.services.heading` | Three departments, one philosophy | ثلاث أقسام... فلسفة وحدة | ثلاثة أقسام... وفلسفة وحدة | |
| `home.journey.heading` | Six moments, one rhythm | ست لحظات... إيقاع وحد | ست لحظات... وإيقاع واحد | |
| `home.brands.eyebrow` | Trusted Partners | شركاء موثوقين | شركاء نثق فيهم | |
| `about.story.paragraphs` | ["Lunia began with a simple frustration: too many facials, too few real results. Customers would leave glowing for a weekend and be back where they started within a week, because nothing about the treatment was calibrated to what their skin actually needed.", "We looked instead to the Korean approach to skin care, where diagnosis comes before treatment and consistency matters more than any single session. That became our founding idea: read the skin first, personalize everything after, and measure quality over months, not days.", "Today Lunia is three departments working from the same philosophy, Skin Quality, Hair & Scalp, and Post-Surgery Recovery, each diagnostic-led, each built to sustain a result rather than chase a moment."] | ["لونيا بدأت من إحباط بسيط: فيشلات كثيرة، ونتايج قليلة. العميلة تطلع من الجلسة وبشرتها تضوي ليومين وترجع زي ما كانت بعد أسبوع، لأن العلاج ما كان مبني فعلاً على اللي بشرتها تحتاجه.", "لجأنا للفلسفة الكورية في العناية بالبشرة، وين التشخيص يجي قبل العلاج، والاستمرارية أهم من أي جلسة وحدة. صارت هذي فكرتنا الأساسية: نقرأ البشرة أول، نخصص كل شي بعدها، ونقيس الجودة على شهور مو على أيام.", "اليوم لونيا ثلاث أقسام تشتغل بنفس الفلسفة، جودة البشرة، الشعر وفروة الرأس، والتعافي بعد الجراحة، كل قسم مبني على التشخيص، وكل قسم يبني نتيجة تدوم مو لحظة توّها تختفي."] | ["لونيا بدأت من إحباط بسيط: فيشلات كثيرة، ونتائج قليلة. العميلة تطلع من الجلسة وبشرتها تضوي ليومين وترجع زي ما كانت بعد أسبوع، لأن العلاج ما كان مبني فعلاً على اللي بشرتها تحتاجه.", "لجأنا للفلسفة الكورية في العناية بالبشرة، وين التشخيص يجي قبل العلاج، والاستمرارية أهم من أي جلسة وحدة. وصارت هذي فكرتنا الأساسية: نقرأ البشرة أول، نخصص كل شي بعدها، ونقيس الجودة على شهور مو على أيام.", "اليوم لونيا ثلاثة أقسام تشتغل بنفس الفلسفة، جودة البشرة، الشعر وفروة الرأس، والتعافي بعد الجراحة، كل قسم مبني على التشخيص، وكل قسم يبني نتيجة تدوم مو لحظة توّها تختفي."] | |
| `servicesIndex.meta.description` | Explore Lunia's three departments, Skin Quality, Hair & Scalp, and Post-Surgery Recovery, each built on a diagnostic-first approach to lasting results. | استكشفي أقسام لونيا الثلاثة، جودة البشرة، الشعر وفروة الرأس، والتعافي بعد الجراحة، كلها مبنية على تشخيص أول لنتايج تدوم. | استكشفي أقسام لونيا الثلاثة: جودة البشرة، الشعر وفروة الرأس، والتعافي بعد الجراحة، وكلها مبنية على التشخيص أول عشان نتائج تدوم. | |
| `servicesIndex.hero.heading` | Three departments, one diagnostic philosophy | ثلاث أقسام... فلسفة تشخيص وحدة | ثلاثة أقسام... وفلسفة تشخيص وحدة | |
| `servicesIndex.treatments.intro` | Twelve protocols across three departments, each one begun with a diagnostic read, never picked from a menu. | اثنا عشر بروتوكول في ثلاث أقسام، كل واحد يبدأ بتحليل حقيقي، مو اختيار من قائمة. | اثنا عشر بروتوكول في ثلاثة أقسام، كل واحد يبدأ بتحليل حقيقي، مو اختيار من قائمة. | |
| `brandsIndex.hero.eyebrow` | Trusted Partners | شركاء موثوقين | شركاء نثق فيهم | |
| `brandsIndex.hero.intro` | We only bring in names we'd recommend to our own families. Each brand below earned its place through results, not marketing, explore what each one is, and why we chose it. | ما ندخل أي علامة إلا اللي نرشحها لعائلاتنا بأنفسنا. كل علامة تحت وصلت لهنا بنتايجها مو بتسويقها، استكشفي وش هي وليش اخترناها. | ما ندخل أي علامة إلا اللي نرشحها لعائلاتنا. كل علامة تحت وصلت لهنا بنتائجها مو بتسويقها، استكشفي وش هي وليش اخترناها. | |
| `brandsIndex.partners.heading` | Every name, earned. | كل اسم، استحق مكانه. | كل اسم هنا استحق مكانه. | |
| `resultsIndex.meta.description` | A look at the quality Lunia customers build over time, across skin, hair & scalp, and post-surgery recovery, shared with consent, session by session. | لمحة عن الجودة اللي تبنيها عميلاتنا مع الوقت، في البشرة والشعر وفروة الرأس والتعافي بعد الجراحة، تُشارك بموافقتهن، جلسة بعد جلسة. | لمحة عن الجودة اللي تبنيها عميلاتنا مع الوقت، في البشرة والشعر وفروة الرأس والتعافي بعد الجراحة، ننشرها بموافقتهن، جلسة بعد جلسة. | |
| `resultsIndex.cta.headline` | Start building your own results | ابدئي تبنين نتايجك الخاصة | ابدئي تبنين نتائجك أنتِ | |
| `resultsIndex.consentNoteReal` | Shared with each customer's written consent; names are never shown. Individual results vary. | تُعرض هذه الصور بموافقة خطية من أصحابها، ودون ذكر أي أسماء. النتائج تختلف من شخص لآخر. | نعرض هذي الصور بموافقة مكتوبة من صاحباتها وبدون أي أسماء. النتائج تختلف من وحدة لثانية. | |
| `journalIndex.hero.intro` | Stories, guides, and the thinking behind our diagnostic-first approach, written by the specialists who deliver it. | قصص وأدلة وأفكار وراء أسلوبنا القائم على التشخيص أولاً، تكتبها نفس الأخصائيات اللي تسوين علاجك. | قصص ونصائح والأفكار اللي ورا أسلوبنا في التشخيص أول، تكتبها الأخصائيات نفسهن اللي يسوون جلساتك. | |
| `contact.meta.description` | Reach Lunia in Riyadh by phone, WhatsApp, or Instagram, or send a diagnostic consultation inquiry, we'll get back to you shortly. | تواصلي مع لونيا في الرياض عن طريق الجوال أو واتساب أو انستقرام، أو ارسلي طلب استشارة تشخيصية، وبنرجع لك قريب. | تواصلي مع لونيا في الرياض بالجوال أو واتساب أو انستقرام، أو أرسلي طلب استشارة تشخيصية، وبنرجع لك قريب. | |
| `contact.hero.heading` | Let's talk about your skin | نحن هنا لأجل بشرتك | خلينا نتكلم عن بشرتك | |
| `contact.hero.intro` | Send us a message and a specialist will get back to you shortly, or reach us directly by phone, WhatsApp, or Instagram. | ارسلي لنا رسالة وبترد عليك إحدى المتخصصات قريب، أو تواصلي معنا مباشرة بالجوال أو واتساب أو انستقرام. | أرسلي لنا رسالة وبترد عليك وحدة من الأخصائيات قريب، أو كلمينا مباشرة بالجوال أو واتساب أو انستقرام. | |
| `contact.mapPlaceholderLabel` | Find us in Riyadh, an interactive map is coming soon | موقعنا في الرياض، خريطة تفاعلية قريباً | موقعنا في الرياض، والخريطة التفاعلية قريب | |
| `contact.napFallback` | Contact details are being updated, check back soon, or message us using the form. | بيانات التواصل قيد التحديث، تابعينا قريب، أو راسلينا من النموذج. | نحدّث بيانات التواصل الحين، تابعينا قريب أو راسلينا من النموذج. | |
| `contact.form.heading` | Send an inquiry | ارسلي طلبك | أرسلي طلبك | |
| `contact.form.intro` | Tell us a little about what you're looking for, and a specialist will follow up with you directly. | خبرينا بس شوي عن اللي تبحثين عنه، وبترد عليك إحدى المتخصصات مباشرة. | قولي لنا شوي عن اللي تدورينه، وبتتواصل معك وحدة من الأخصائيات مباشرة. | |
| `contact.form.submitLabel` | Send inquiry | ارسال الطلب | أرسلي الطلب | |
| `contact.form.submittingLabel` | Sending… | جارٍ الإرسال… | جاري الإرسال… | |
| `contact.form.messageHelp` | A sentence or two is plenty. A specialist will read it personally. | جملة أو جملتين تكفي، وبتقراها إحدى المتخصصات بنفسها. | جملة أو جملتين تكفي، وبتقراها الأخصائية بنفسها. | |
| `contact.form.errors.name` | Please enter your full name. | الرجاء إدخال اسمك الكامل. | اكتبي اسمك الكامل. | |
| `contact.form.errors.phone` | Please enter a valid phone number. | الرجاء إدخال رقم جوال صحيح. | اكتبي رقم جوال صحيح. | |
| `contact.form.errors.email` | Please enter a valid email address. | الرجاء إدخال إيميل صحيح. | اكتبي إيميل صحيح. | |
| `contact.form.errors.message` | Tell us a little more (at least 10 characters). | خبرينا شوي أكثر (10 أحرف على الأقل). | قولي لنا شوي أكثر (10 أحرف على الأقل). | |
| `contact.status.open` | Open today, {open} – {close} | مفتوح اليوم، {open} – {close} | مفتوحين اليوم، {open} – {close} | |
| `contact.status.closed` | Closed today | مغلق اليوم | مسكّرين اليوم | |
| `contact.strip.directions.link` | Get directions | الاتجاهات | وصّليني | |
| `contact.closedLabel` | Closed | مغلق | مسكّر | |
| `serviceDepartment.emptyServices` | Services for this department are being updated, check back soon. | علاجات هذا القسم قيد التحديث، تابعينا قريب. | نحدّث علاجات هذا القسم الحين، تابعينا قريب. | |
| `serviceDepartment.highlights` | Get the highlights. | أبرز العلاجات. | أبرز العلاجات | |
| `book.service.tierNote` | Available to {tier} members and above | متاحة لعضوات {tier} وما فوق | متاحة لعضوات {tier} وأعلى | |
| `book.date.loadingSlots` | Loading available times… | جارٍ تحميل الأوقات المتاحة… | جاري تحميل الأوقات المتاحة… | |
| `book.waitlist.joiningLabel` | Joining… | جارٍ الانضمام… | جاري التسجيل… | |
| `book.waitlist.joinedMessage` | You're on the waitlist, we'll reach out the moment a spot opens up. | تم تسجيلك في قائمة الانتظار، بنتواصل معك أول ما يفتح موعد. | سجّلناك في قائمة الانتظار، وبنكلمك أول ما يفتح موعد. | |
| `book.contact.intro` | We'll send a 6-digit code to confirm your phone or email. | بنرسل رمز تأكيد مكوّن من 6 أرقام على جوالك أو إيميلك. | بنرسل لك رمز تحقق من 6 أرقام على جوالك أو إيميلك. | |
| `book.contact.sendCodeLabel` | Send verification code | إرسال رمز التأكيد | أرسلي رمز التحقق | |
| `book.contact.sendingLabel` | Sending… | جارٍ الإرسال… | جاري الإرسال… | |
| `book.contact.codeIntro` | Enter the 6-digit code sent to {contact}. | أدخلي الرمز المكوّن من 6 أرقام اللي وصلك على {contact}. | اكتبي الرمز (6 أرقام) اللي وصلك على {contact}. | |
| `book.contact.codeLabel` | Verification code | رمز التأكيد | رمز التحقق | |
| `book.contact.verifyingLabel` | Confirming… | جارٍ التأكيد… | جاري التأكيد… | |
| `book.contact.changeContactLabel` | Use a different phone or email | استخدام رقم أو إيميل ثاني | استخدمي رقم أو إيميل ثاني | |
| `book.contact.giftCardLabel` | Gift card code (optional) | كود بطاقة الهدايا (اختياري) | كود بطاقة الهدية (اختياري) | |
| `book.contact.giftCardHint` | Have a gift card? We'll apply what we can toward this booking. | عندك بطاقة هدايا؟ بنطبّق اللي نقدر عليه على هذا الحجز. | عندك بطاقة هدية؟ بنخصم رصيدها من هذا الحجز على قد ما نقدر. | |
| `book.contact.codeHelp` | Didn't get it? Check your spam folder, or use a different phone or email. | ما وصلك؟ تأكدي من مجلد الرسائل غير المرغوبة، أو استخدمي رقم أو إيميل ثاني. | ما وصلك؟ شوفي مجلد الرسائل غير المرغوب فيها، أو استخدمي رقم أو إيميل ثاني. | |
| `book.success.giftCardAppliedLabel` | Gift card applied | المبلغ المطبّق من بطاقة الهدايا | المخصوم من بطاقة الهدية | |
| `book.success.usePackageLabel` | Use a package for this booking | استخدام باقة لهذا الحجز | استخدمي باقة لهذا الحجز | |
| `book.success.applyPackageLabel` | Apply package | تطبيق الباقة | استخدمي الباقة | |
| `book.success.applyingLabel` | Applying… | جارٍ التطبيق… | جاري التطبيق… | |
| `book.success.packageAppliedLabel` | Package session applied to this booking. | تم تطبيق جلسة من الباقة على هذا الحجز. | تم، خصمنا جلسة من باقتك لهذا الحجز. | |
| `book.success.accountLabel` | View my bookings | عرض حجوزاتي | شوفي حجوزاتي | |
| `book.errors.missingContact` | Please enter your name and a phone number or email address. | الرجاء إدخال الاسم ورقم الجوال أو الإيميل. | اكتبي اسمك ورقم جوالك أو إيميلك. | |
| `book.errors.invalidPhone` | Please enter a valid phone number. | الرجاء إدخال رقم جوال صحيح. | اكتبي رقم جوال صحيح. | |
| `book.errors.invalidIdentifier` | Please enter a valid phone number or email address. | الرجاء إدخال رقم جوال أو إيميل صحيح. | اكتبي رقم جوال أو إيميل صحيح. | |
| `book.errors.invalidCode` | That code is incorrect or has expired, please try again. | الرمز غير صحيح أو انتهت صلاحيته، حاولي مرة ثانية. | الرمز غلط أو انتهت صلاحيته، حاولي مرة ثانية. | |
| `book.errors.serviceUnavailable` | This service isn't available for online booking right now. | هذي الخدمة غير متاحة للحجز أونلاين حالياً. | هذي الخدمة مو متاحة للحجز أونلاين حالياً. | |
| `book.errors.tierGated` | This service is available to {tier} members and above. | هذي الخدمة متاحة لعضوات {tier} وما فوق. | هذي الخدمة متاحة لعضوات {tier} وأعلى. | |
| `book.errors.slotTaken` | That time was just taken, please choose another. | هذا الوقت انحجز للتو، الرجاء اختيار وقت ثاني. | هذا الوقت انحجز للتو، اختاري وقت ثاني. | |
| `book.errors.noService` | Please choose a service first. | الرجاء اختيار خدمة أول. | اختاري الخدمة أول. | |
| `book.errors.noSlot` | Please choose a time first. | الرجاء اختيار وقت أول. | اختاري الوقت أول. | |
| `book.errors.nameRequired` | Please enter your full name. | الرجاء إدخال اسمك الكامل. | اكتبي اسمك الكامل. | |
| `book.errors.identifierRequired` | Please enter a phone number or email address. | الرجاء إدخال رقم الجوال أو الإيميل. | اكتبي رقم جوالك أو إيميلك. | |
| `book.errors.codeIncomplete` | Enter all 6 digits of the code. | أدخلي الرمز كامل (6 أرقام). | اكتبي الرمز كامل (6 أرقام). | |
| `book.errors.packageEmpty` | This package has no sessions left. | — (new) | ما بقى جلسات في هذي الباقة. | |
| `book.errors.packageExpired` | This package has expired. | — (new) | هذي الباقة انتهت صلاحيتها. | |
| `book.stepper.completed` | (completed) | (مكتملة) | (خلصت) | |
| `book.stepper.goBackTo` | Go back to {step} | الرجوع إلى {step} | ارجعي إلى {step} | |
| `account.meta.description` | View your upcoming and past appointments at Lunia, manage bookings, and rebook your next visit. | شوفي حجوزاتك القادمة والسابقة في لونيا، أديري حجوزاتك، واحجزي زيارتك الجاية. | شوفي حجوزاتك القادمة والسابقة في لونيا، رتّبي مواعيدك، واحجزي زيارتك الجاية. | |
| `account.login.meta.description` | Sign in with your phone or email to view and manage your Lunia bookings. | سجّلي الدخول برقم جوالك أو بريدك الإلكتروني لعرض حجوزاتك وإدارتها. | سجّلي دخولك برقم جوالك أو إيميلك عشان تشوفين حجوزاتك وترتبينها. | |
| `account.login.intro` | Enter your phone or email and we will send you a verification code to sign in. | أدخلي رقم جوالك أو بريدك الإلكتروني وبنرسل لك رمز التحقق لتسجيل الدخول. | اكتبي رقم جوالك أو إيميلك، وبنرسل لك رمز تحقق تدخلين فيه. | |
| `account.login.sendCodeLabel` | Send verification code | إرسال رمز التأكيد | أرسلي رمز التحقق | |
| `account.login.sendingLabel` | Sending… | جارٍ الإرسال… | جاري الإرسال… | |
| `account.login.codeIntro` | Enter the code sent to {contact}. | أدخلي رمز التحقق المُرسل إلى {contact}. | اكتبي الرمز اللي وصلك على {contact}. | |
| `account.login.codeLabel` | Verification code | رمز التأكيد | رمز التحقق | |
| `account.login.verifyingLabel` | Signing in… | جارٍ تسجيل الدخول… | جاري تسجيل الدخول… | |
| `account.login.changeNumberLabel` | Use a different number | استخدام رقم ثاني | استخدمي رقم ثاني | |
| `account.login.errors.missingPhone` | Please enter your phone number. | الرجاء إدخال رقم جوالك. | اكتبي رقم جوالك. | |
| `account.login.errors.invalidPhone` | Please enter a valid phone number. | الرجاء إدخال رقم جوال صحيح. | اكتبي رقم جوال صحيح. | |
| `account.login.errors.invalidCode` | That code is incorrect or has expired, please try again. | الرمز غير صحيح أو انتهت صلاحيته، حاولي مرة ثانية. | الرمز غلط أو انتهت صلاحيته، حاولي مرة ثانية. | |
| `account.login.errors.missingIdentifier` | Please enter your phone or email. | فضلاً أدخلي رقم جوالك أو بريدك الإلكتروني. | اكتبي رقم جوالك أو إيميلك. | |
| `account.login.errors.invalidIdentifier` | Please enter a valid phone number or email. | فضلاً أدخلي رقم جوال أو بريد إلكتروني صحيح. | اكتبي رقم جوال أو إيميل صحيح. | |
| `account.login.errors.invalidCredentials` | Those sign-in details are incorrect, please try again. | بيانات الدخول غير صحيحة، حاولي مرة ثانية. | بيانات الدخول غلط، حاولي مرة ثانية. | |
| `account.login.errors.missingPassword` | Please enter your password. | فضلاً أدخلي كلمة المرور. | اكتبي كلمة المرور. | |
| `account.login.errors.emailOnly` | Please sign in with your email address. | الرجاء تسجيل الدخول بالبريد الإلكتروني. | سجّلي دخولك بالإيميل. | |
| `account.login.errors.phoneOnly` | Please sign in with your phone number. | الرجاء تسجيل الدخول برقم جوالك. | سجّلي دخولك برقم جوالك. | |
| `account.login.identifierLabel` | Phone or email | الجوال أو البريد الإلكتروني | الجوال أو الإيميل | |
| `account.login.changeContactLabel` | Use a different phone or email | استخدمي جوالاً أو بريداً آخر | استخدمي رقم أو إيميل ثاني | |
| `account.login.nameHint` | First time signing in? Add your name so we can address you properly. | أول مرة تسجّلين الدخول؟ أضيفي اسمك حتى نخاطبك به. | أول مرة تدخلين؟ اكتبي اسمك عشان نناديك فيه. | |
| `account.login.signInWithPassword` | Sign in with a password instead | سجّلي الدخول بكلمة المرور بدلاً من الرمز | ادخلي بكلمة المرور بدال الرمز | |
| `account.login.signInWithCode` | Sign in with a verification code instead | سجّلي الدخول برمز التحقق بدلاً من كلمة المرور | ادخلي برمز التحقق بدال كلمة المرور | |
| `account.login.emailLabel` | Email address | البريد الإلكتروني | الإيميل | |
| `account.login.brandLabel` | Lunia | — (new) | لونيا | |
| `account.signedInAs` | Signed in as {name} | مسجّلة دخول باسم {name} | داخلة باسم {name} | |
| `account.cancellingLabel` | Cancelling… | جارٍ الإلغاء… | جاري الإلغاء… | |
| `account.status.REQUESTED` | Requested | قيد الطلب | بانتظار التأكيد | |
| `account.status.CHECKED_IN` | Checked in | تم تسجيل الوصول | تم تسجيل الحضور | |
| `account.status.COMPLETED` | Completed | مكتمل | تم | |
| `account.errors.notAuthenticated` | Please sign in to manage your bookings. | الرجاء تسجيل الدخول لإدارة حجوزاتك. | سجّلي دخولك عشان ترتبين حجوزاتك. | |
| `account.errors.tooLateToCancel` | This booking can no longer be cancelled online, please contact us. | ما يمكن إلغاء هذا الحجز أونلاين الحين، تواصلي معنا. | ما نقدر نلغي هذا الحجز أونلاين الحين، تواصلي معنا. | |
| `account.errors.tooLateToReschedule` | This booking is less than 24 hours away and can no longer be moved online — please contact us. | باقي على موعدك أقل من ٢٤ ساعة، وما يمكن تغييره أونلاين — تواصلي معنا وبنساعدك. | باقي على موعدك أقل من 24 ساعة، وما ينفع نغيّره أونلاين — تواصلي معنا وبنساعدك. | |
| `account.errors.slotUnavailable` | That time was just taken. Please pick another one. | هذا الوقت انحجز للتو، اختاري وقت ثاني لو سمحتِ. | هذا الوقت انحجز للتو، اختاري وقت ثاني. | |
| `account.notifications.remindersHint` | A reminder 24 hours before your appointment. | تذكير قبل موعدك بـ24 ساعة. | نذكّرك قبل موعدك بـ24 ساعة. | |
| `account.notifications.marketingHint` | Occasional promotions and updates from Lunia. | عروض وتحديثات من لونيا بين فترة وأخرى. | عروض وأخبار من لونيا بين فترة وثانية. | |
| `account.notifications.saveLabel` | Save preferences | حفظ التفضيلات | احفظي التفضيلات | |
| `account.notifications.savingLabel` | Saving… | جارٍ الحفظ… | جاري الحفظ… | |
| `account.notifications.errors.notAuthenticated` | Please sign in to manage your notification preferences. | الرجاء تسجيل الدخول لإدارة تفضيلات الإشعارات. | سجّلي دخولك عشان تعدّلين الإشعارات. | |
| `account.loyalty.topTierReached` | You've reached our top tier | وصلتي لأعلى مستوى عندنا | وصلتِ لأعلى مستوى عندنا | |
| `account.loyalty.emptyHistory` | No points activity yet, it starts with your first completed visit. | ما فيه نشاط نقاط بعد، يبدأ من أول زيارة تكمّلينها. | ما فيه نشاط نقاط للحين، يبدأ من أول زيارة تخلصينها. | |
| `account.credits.intro` | Your gift card balances and prepaid session packages. | أرصدة بطاقات الهدايا وباقات الجلسات المدفوعة مسبقًا. | رصيد بطاقات الهدايا وباقات الجلسات اللي دفعتيها مقدماً. | |
| `account.credits.emptyGiftCards` | You don't have any gift card balance yet. | ما عندك رصيد بطاقة هدايا لحد الآن. | ما عندك رصيد بطاقة هدية للحين. | |
| `account.credits.emptyPackages` | You don't have any active packages yet. | ما عندك باقات فعالة لحد الآن. | ما عندك باقات فعّالة للحين. | |
| `account.security.intro` | Set your name so we can address you properly, and add a password so you can sign in without a code. | أضيفي اسمك حتى نخاطبك به، وأضيفي كلمة مرور تسجّلين فيها الدخول دون رمز. | اكتبي اسمك عشان نناديك فيه، وحطي كلمة مرور تدخلين فيها بدون رمز. | |
| `account.security.nameSaveLabel` | Save name | حفظ الاسم | احفظي الاسم | |
| `account.security.savingLabel` | Saving… | جارٍ الحفظ… | جاري الحفظ… | |
| `account.security.passwordIntroSet` | You can sign in with a password. Enter a new one below to change it. | تقدرين تسجّلين الدخول بكلمة المرور. أدخلي كلمة جديدة أدناه لتغييرها. | تقدرين تدخلين بكلمة المرور. اكتبي كلمة جديدة تحت إذا تبين تغيرينها. | |
| `account.security.passwordIntroUnset` | Add a password so you can sign in without waiting for a code. | أضيفي كلمة مرور تسجّلين فيها الدخول دون انتظار رمز. | حطي كلمة مرور عشان تدخلين بدون ما تنتظرين رمز. | |
| `account.security.passwordSaveLabel` | Save password | حفظ كلمة المرور | احفظي كلمة المرور | |
| `account.security.passwordSetBadge` | Password is set | تم تعيين كلمة المرور | كلمة المرور محفوظة | |
| `account.security.errors.notAuthenticated` | Please sign in again. | يرجى تسجيل الدخول مرة أخرى. | سجّلي دخولك مرة ثانية. | |
| `account.security.errors.invalidName` | Please enter your name. | يرجى إدخال اسمك. | اكتبي اسمك. | |
| `account.security.errors.passwordTooShort` | Password must be at least {min} characters. | يجب أن تتكون كلمة المرور من {min} أحرف على الأقل. | كلمة المرور لازم تكون {min} أحرف على الأقل. | |
| `account.security.errors.passwordMismatch` | The passwords do not match. | كلمتا المرور غير متطابقتين. | كلمتين المرور مو متطابقتين. | |
| `account.security.errors.generic` | Something went wrong, please try again. | حدث خطأ ما، يرجى المحاولة مرة أخرى. | صار خطأ، حاولي مرة ثانية. | |
| `account.viewLabel` | View details | عرض التفاصيل | التفاصيل | |
| `account.detail.back` | Back to my account | الرجوع إلى حسابي | رجوع لحسابي | |
| `account.detail.customerNoteHint` | Share anything we should know before your visit — sensitivities, preferences, or a special request. | شاركينا أي شيء يهمّنا قبل زيارتك — حساسية، تفضيلات، أو طلب خاص. | قولي لنا أي شي نحتاج نعرفه قبل زيارتك — حساسية، شي تفضلينه، أو طلب خاص. | |
| `account.detail.save` | Save note | حفظ الملاحظة | احفظي الملاحظة | |
| `account.detail.saving` | Saving… | جارٍ الحفظ… | جاري الحفظ… | |
| `account.reschedule.hint` | Pick a new day and time. You can move your appointment up to 24 hours before it starts. | اختاري يوم ووقت جديد. تقدرين تغيّرين موعدك لين قبل ٢٤ ساعة من بدايته. | اختاري يوم ووقت جديد. تقدرين تغيّرين موعدك لين قبل 24 ساعة من بدايته. | |
| `account.reschedule.confirm` | Move my appointment | انقلي موعدي | غيّري موعدي | |
| `account.reschedule.moving` | Moving… | جارٍ النقل… | جاري التغيير… | |
| `account.reschedule.done` | Done — your appointment has been moved. | تم — نقلنا موعدك. | تم — غيّرنا موعدك. | |
| `account.reschedule.policy` | Online changes close 24 hours before your appointment. | التغيير أونلاين متاح لين قبل ٢٤ ساعة من موعدك. | التغيير أونلاين متاح لين قبل 24 ساعة من موعدك. | |
| `account.membership.paidUntil` | Your membership is paid until {date}. | عضويتك مدفوعة حتى {date}. | عضويتك مدفوعة لين {date}. | |
| `account.membership.unpaid` | This month's invoice is waiting for payment — you'll find it under My invoices. Benefits resume once it's paid. | فاتورة هذا الشهر بانتظار الدفع — تلقينها في «فواتيري». ترجع المزايا بعد الدفع. | فاتورة هذا الشهر تنتظر الدفع — تلقينها في «فواتيري». المزايا ترجع أول ما تدفعينها. | |
| `review.meta.description` | Tell us about your visit to Lunia. | أخبرينا عن تجربتك في لونيا. | قولي لنا عن زيارتك للونيا. | |
| `review.intro` | Your feedback helps other customers and helps us improve. This only takes a minute. | رأيك يساعد العميلات الأخريات ويساعدنا على التطور. لن يستغرق الأمر إلا دقيقة. | رأيك يفيد غيرك من العميلات ويساعدنا نتطور. ما ياخذ إلا دقيقة. | |
| `review.bodyLabel` | Tell us more (optional) | أخبرينا المزيد (اختياري) | قولي لنا أكثر (اختياري) | |
| `review.bodyPlaceholder` | What did you enjoy about your visit? | ما الذي أعجبك في زيارتك؟ | وش أكثر شي عجبك في زيارتك؟ | |
| `review.nameLabel` | Name to display (optional) | الاسم الظاهر (اختياري) | الاسم اللي يظهر (اختياري) | |
| `review.consentLabel` | I'm happy for Lunia to feature this review publicly (e.g. on the website). | أوافق على أن تشارك لونيا هذا التقييم بشكل علني (مثلاً على الموقع الإلكتروني). | موافقة إن لونيا تنشر تقييمي (مثلاً في الموقع). | |
| `review.submitLabel` | Submit review | إرسال التقييم | أرسلي التقييم | |
| `review.ratingRequired` | Please choose a rating from 1 to 5 stars. | يرجى اختيار تقييم من 1 إلى 5 نجوم. | اختاري تقييم من 1 إلى 5 نجوم. | |
| `review.successBody` | Your review has been received and will appear once it's reviewed by our team. | تم استلام تقييمك وسيظهر بعد مراجعته من فريقنا. | وصلنا تقييمك، وبيظهر بعد ما يراجعه فريقنا. | |
| `review.alreadySubmittedHeading` | Already submitted | تم الإرسال مسبقاً | أرسلتيه من قبل | |
| `review.alreadySubmittedBody` | This review link has already been used. Thank you again for sharing your feedback. | تم استخدام رابط التقييم هذا من قبل. شكراً لك على مشاركة رأيك. | هذا الرابط استخدمتيه قبل. شكراً مرة ثانية على رأيك. | |
| `review.invalidHeading` | Link not found | الرابط غير موجود | ما لقينا الرابط | |
| `review.invalidBody` | This review link is invalid or has expired. | رابط التقييم غير صالح أو منتهي الصلاحية. | رابط التقييم غلط أو انتهت صلاحيته. | |
| `review.errors.generic` | Something went wrong, please try again. | حدث خطأ ما، يرجى المحاولة مرة أخرى. | صار خطأ، حاولي مرة ثانية. | |
| `giftCards.hero.intro` | Choose an amount, add a personal note, and we'll send the gift card code by email — ready to use for any Lunia service. | اختاري القيمة، أضيفي رسالة، وبنرسل رمز البطاقة على الإيميل — جاهز للاستخدام على أي خدمة في لونيا. | اختاري القيمة، أضيفي رسالة، وبنرسل كود البطاقة على الإيميل — جاهز لأي خدمة في لونيا. | |
| `giftCards.form.purchaserEmail` | Your email | بريدك الإلكتروني | إيميلك | |
| `giftCards.form.recipientName` | Recipient name (optional) | اسم المُهدى إليه (اختياري) | اسم المُهداة (اختياري) | |
| `giftCards.form.recipientEmail` | Recipient email (optional) | إيميل المُهدى إليه (اختياري) | إيميل المُهداة (اختياري) | |
| `giftCards.form.recipientHint` | Leave blank to receive the code yourself. | اتركيه فارغاً لتستلمي الرمز بنفسك. | خليه فاضي إذا تبين الكود يوصلك أنتِ. | |
| `giftCards.form.submitting` | Processing… | جارٍ المعالجة… | جاري المعالجة… | |
| `giftCards.form.secure` | Secure checkout — no card details are stored by Lunia. | دفع آمن — لونيا لا تحفظ بيانات بطاقتك. | دفع آمن — لونيا ما تحفظ بيانات بطاقتك. | |
| `giftCards.form.amountHelp` | Between {min} and {max} SAR, in steps of 10. | من {min} إلى {max} ريال، بزيادات 10 ريال. | من {min} إلى {max} ريال، والمبلغ يكون من مضاعفات 10. | |
| `giftCards.success.intro` | We've emailed the code. Here it is too — keep it safe: | أرسلنا الرمز على الإيميل، وهذا هو أيضاً — احتفظي فيه: | أرسلنا الكود على الإيميل، وهذا هو بعد — احتفظي فيه: | |
| `giftCards.success.copy` | Copy code | نسخ الرمز | انسخي الكود | |
| `giftCards.errors.amount` | Please choose a valid amount. | الرجاء اختيار قيمة صحيحة. | اختاري قيمة صحيحة. | |
| `giftCards.errors.purchaserName` | Please enter your name. | الرجاء إدخال اسمك. | اكتبي اسمك. | |
| `giftCards.errors.purchaserEmail` | Please enter a valid email address. | الرجاء إدخال إيميل صحيح. | اكتبي إيميل صحيح. | |
| `giftCards.errors.recipientEmail` | Please enter a valid email address for the recipient. | الرجاء إدخال إيميل صحيح للمُهدى إليها. | اكتبي إيميل صحيح للمُهداة. | |
| `giftCards.buy.unavailableBody` | Online gift card payment is coming soon. Visit us or message us on WhatsApp and we'll prepare a gift card for you in minutes. | الدفع الإلكتروني لبطاقات الهدايا قريباً. زورينا أو راسلينا على واتساب ونجهّز لك بطاقة الهدية خلال دقائق. | الدفع أونلاين لبطاقات الهدايا قريب. زورينا أو راسلينا واتساب ونجهّز لك البطاقة خلال دقائق. | |
| `ui.showTestimonial` | Show testimonial {n} | — (new) | عرض الرأي {n} | |
| `ui.prevTestimonial` | Previous testimonial | — (new) | الرأي السابق | |
| `ui.nextTestimonial` | Next testimonial | — (new) | الرأي التالي | |
| `health.meta.description` | Your medical history and skin details, kept private for your specialist. | تاريخك الطبي وتفاصيل بشرتك، محفوظة بسرية لأخصائيتك. | تاريخك الصحي وتفاصيل بشرتك، محفوظة بسرية لأخصائيتك. | |
| `health.card.intro` | A few questions about your skin and health so your specialist can plan safe treatments for you. | كم سؤال عن بشرتك وصحتك عشان أخصائيتك تخطط لك جلسات آمنة ومناسبة لك. | أسئلة قليلة عن بشرتك وصحتك، تساعد أخصائيتك على التخطيط لجلسات آمنة ومناسبة لكِ. | |
| `health.card.empty` | You haven't filled in your health profile yet. | للحين ما عبّيتي ملفك الصحي. | لم تُكملي ملفك الصحي بعد. | |
| `health.card.start` | Fill in my health profile | عبّي ملفي الصحي | تعبئة ملفي الصحي | |
| `health.card.update` | Review and update | راجعيه وحدّثيه | مراجعة وتحديث | |
| `health.intro` | Please answer as accurately as you can. It takes about five minutes, and you can update it any time something changes. | جاوبي بدقة قد ما تقدرين. ياخذ تقريبًا خمس دقايق، وتقدرين تحدّثينه أي وقت يتغير فيه شي. | يُرجى الإجابة بأكبر قدر من الدقة. يستغرق ذلك نحو خمس دقائق، ويمكنكِ تحديثه في أي وقت عند تغيّر أي شيء. | |
| `health.privacy` | Your answers are confidential and only seen by the Lunia clinical team. | إجاباتك سرية وما يشوفها إلا الفريق السريري في لونيا. | إجاباتكِ سرية، ولا يطّلع عليها إلا الفريق السريري في لونيا. | |
| `health.sections.notes` | Anything else | أي شي ثاني | معلومات إضافية | |
| `health.fields.skinType` | How would you describe your skin? | كيف توصفين بشرتك؟ | كيف تصفين بشرتك؟ | |
| `health.fields.concerns` | What would you like help with? | وش تبين نساعدك فيه؟ | ما الذي ترغبين في تحسينه؟ | |
| `health.fields.goalsPlaceholder` | For example: calmer skin before my wedding in March | مثلًا: بشرة أهدى قبل زواجي في مارس | مثال: بشرة أهدأ قبل حفل زفافي في مارس | |
| `health.fields.conditions` | Do you have, or have you had, any of the following? | عندك أو كان عندك شي من هذي؟ | هل لديكِ حالياً، أو سبق أن كان لديكِ، أيٌّ مما يلي؟ | |
| `health.fields.conditionsOther` | Other conditions | حالات ثانية | حالات صحية أخرى | |
| `health.fields.medications` | Are you taking, or have you recently taken, any of the following? | تاخذين أو أخذتي مؤخرًا شي من هذي؟ | هل تتناولين حالياً، أو تناولتِ مؤخراً، أيّاً مما يلي؟ | |
| `health.fields.isotretinoinLastDose` | Date of your last isotretinoin dose (if you know it) | تاريخ آخر جرعة روكتان (إذا تعرفينه) | تاريخ آخر جرعة من الأيزوتريتينوين (روكتان)، إن كنتِ تعرفينه | |
| `health.fields.medicationsOther` | Other medications or supplements | أدوية أو مكملات ثانية | أدوية أو مكملات أخرى | |
| `health.fields.allergies` | Allergies (medicines, products, anaesthetics, latex...) | الحساسية (أدوية، منتجات، بنج، لاتكس...) | الحساسية (أدوية، منتجات، مواد التخدير، اللاتكس...) | |
| `health.fields.allergiesPlaceholder` | Leave empty if none | خليه فاضي إذا ما عندك | اتركي الحقل فارغاً إن لم يكن لديكِ حساسية | |
| `health.fields.pregnant` | Are you pregnant or trying to get pregnant? | أنتِ حامل أو تحاولين تحملين؟ | هل أنتِ حامل، أو تخططين للحمل؟ | |
| `health.fields.breastfeeding` | Are you breastfeeding? | أنتِ مرضعة؟ | هل أنتِ مرضع حالياً؟ | |
| `health.fields.yes` | Yes | إيه | نعم | |
| `health.fields.proceduresHint` | Laser, peels, fillers, Botox, microneedling or surgery in the last 6 months. | ليزر، تقشير، فيلر، بوتوكس، مايكرونيدلنق أو عملية خلال آخر ٦ شهور. | ليزر، تقشير، فيلر، بوتوكس، مايكرونيدلينغ، أو أي عملية جراحية خلال الأشهر الستة الماضية. | |
| `health.fields.addProcedure` | Add a procedure | أضيفي إجراء | إضافة إجراء | |
| `health.fields.removeProcedure` | Remove | احذفي | حذف | |
| `health.fields.sunExposure` | How much sun are you exposed to day to day? | كم تتعرضين للشمس في يومك؟ | ما مدى تعرّضكِ للشمس في يومكِ المعتاد؟ | |
| `health.fields.recentTan` | I have been tanned or sunburnt in the last 2 weeks | تسمّرت أو احترقت بشرتي من الشمس خلال آخر أسبوعين | تعرّضتُ لاسمرار أو حروق من الشمس خلال الأسبوعين الماضيين | |
| `health.fields.hairPattern` | Where do you notice the hair loss? | وين تلاحظين تساقط الشعر؟ | أين تلاحظين تساقط الشعر؟ | |
| `health.fields.hairDuration` | For how long? | من متى؟ | منذ متى؟ | |
| `health.fields.hairNotes` | Anything else about your hair (recent illness, stress, diet...) | أي شي ثاني عن شعرك (مرض مؤخرًا، ضغط، أكل...) | أي معلومات أخرى عن شعركِ (مرض حديث، ضغط نفسي، النظام الغذائي...) | |
| `health.fields.surgeonInstructions` | Instructions from your surgeon | تعليمات الجرّاح لك | تعليمات الجرّاح | |
| `health.fields.notes` | Anything else we should know | أي شي ثاني تبين نعرفه | أي معلومات أخرى ترغبين في إطلاعنا عليها | |
| `health.fields.select` | Select | اختاري | اختيار | |
| `health.conditions.pacemaker` | Pacemaker or metal implants | منظّم ضربات قلب أو معادن مزروعة | جهاز منظّم لضربات القلب أو أجزاء معدنية مزروعة | |
| `health.medications.isotretinoin` | Isotretinoin (Roaccutane) in the last 6 months | روكتان (أيزوتريتينوين) خلال آخر ٦ شهور | الأيزوتريتينوين (روكتان) خلال الأشهر الستة الماضية | |
| `health.medications.photosensitizing` | Medicines that make the skin sun-sensitive | أدوية تخلي البشرة حساسة للشمس | أدوية تزيد حساسية البشرة للشمس | |
| `health.medications.oralSteroids` | Steroid tablets | حبوب الكورتيزون | أقراص الكورتيزون | |
| `health.procedures.microneedling` | Microneedling | مايكرونيدلنق | مايكرونيدلينغ | |
| `health.procedures.surgery` | Surgery | عملية | عملية جراحية | |
| `health.procedures.other` | Other | غيره | أخرى | |
| `health.sunExposure.low` | Mostly indoors | أغلب وقتي داخل | معظم وقتي في الداخل | |
| `health.sunExposure.moderate` | Some time outdoors | أطلع شوي برا | بعض الوقت في الخارج | |
| `health.sunExposure.high` | Outdoors a lot | أطلع برا كثير | وقت طويل في الخارج | |
| `health.hairPatterns.diffuse` | All over (general thinning) | في كل الراس (خفّة عامة) | في كامل الرأس (خفّة عامة) | |
| `health.hairPatterns.receding` | Hairline or temples | خط الشعر أو الجوانب | خط الشعر الأمامي أو الصدغان | |
| `health.hairPatterns.crown` | Crown | أعلى الراس | أعلى الرأس | |
| `health.hairPatterns.widening` | Widening parting | الفرق صاير أعرض | اتساع مفرق الشعر | |
| `health.hairPatterns.patchy` | Patches | بقع | على شكل بقع | |
| `health.hairDurations.lt6m` | Less than 6 months | أقل من ٦ شهور | أقل من 6 أشهر | |
| `health.hairDurations.6to12m` | 6 to 12 months | من ٦ إلى ١٢ شهر | من 6 إلى 12 شهراً | |
| `health.hairDurations.1to3y` | 1 to 3 years | من سنة إلى ٣ سنين | من سنة إلى 3 سنوات | |
| `health.hairDurations.gt3y` | More than 3 years | أكثر من ٣ سنين | أكثر من 3 سنوات | |
| `health.submit` | Save my health profile | احفظي ملفي الصحي | حفظ ملفي الصحي | |
| `health.saved` | Thank you. Your health profile is saved. | شكرًا لك. انحفظ ملفك الصحي. | شكراً لكِ. تم حفظ ملفك الصحي. | |
| `health.back` | Back to my account | ارجعي لحسابي | العودة إلى حسابي | |
| `health.errors.notAuthenticated` | Please sign in again to continue. | سجّلي دخولك مرة ثانية عشان تكملين. | يُرجى تسجيل الدخول مرة أخرى للمتابعة. | |
| `health.errors.generic` | Something went wrong. Please try again. | صار خطأ. حاولي مرة ثانية. | حدث خطأ. يُرجى المحاولة مرة أخرى. | |
| `consents.meta.description` | Read and sign your treatment consent forms. | اقرئي نماذج الموافقة على الجلسات ووقّعيها. | اقرئي نماذج الموافقة على العلاج ووقّعيها. | |
| `consents.card.intro` | Please read and sign these before your visit. It saves time at the front desk. | اقرئيها ووقّعيها قبل زيارتك، توفّر عليك وقت في الاستقبال. | يُرجى قراءة هذه النماذج وتوقيعها قبل زيارتك، فذلك يختصر وقتك في الاستقبال. | |
| `consents.card.empty` | There are no forms for you to sign right now. | ما فيه نماذج تحتاج توقيعك حاليًا. | لا توجد نماذج بانتظار توقيعك حالياً. | |
| `consents.card.signed` | Signed {date} | انوقّع {date} | تم التوقيع في {date} | |
| `consents.card.needsSignature` | Not signed yet | ما انوقّع للحين | لم يتم التوقيع بعد | |
| `consents.card.newVersion` | Updated since you signed. Please sign the new version. | تحدّث النموذج بعد ما وقّعتي. وقّعي النسخة الجديدة لو سمحتي. | تم تحديث النموذج بعد توقيعك. يُرجى توقيع النسخة الجديدة. | |
| `consents.card.sign` | Read and sign | اقرئي ووقّعي | القراءة والتوقيع | |
| `consents.card.view` | View signed copy | شوفي النسخة الموقّعة | عرض النسخة الموقّعة | |
| `consents.sign.heading` | Read and sign | اقرئي ووقّعي | القراءة والتوقيع | |
| `consents.sign.readCarefully` | Please read the form carefully. If anything is unclear, ask us before signing. | اقرئي النموذج بتمعّن، وإذا فيه شي مو واضح اسألينا قبل التوقيع. | يُرجى قراءة النموذج بعناية، وإن كان هناك ما هو غير واضح فاسألينا قبل التوقيع. | |
| `consents.sign.signatureHint` | Sign with your finger, stylus or mouse inside the box. | وقّعي بإصبعك أو القلم أو الماوس داخل المربع. | وقّعي داخل المربع بإصبعك أو بالقلم أو بالفأرة. | |
| `consents.sign.clear` | Clear | امسحي | مسح | |
| `consents.sign.agree` | I have read and understood this form and I agree to it. | قريت النموذج وفهمته وأوافق عليه. | أقرّ بأنني قرأت هذا النموذج وفهمته، وأوافق عليه. | |
| `consents.sign.submit` | Sign the form | وقّعي النموذج | توقيع النموذج | |
| `consents.sign.success` | Thank you. Your form is signed. | شكرًا لك. انوقّع النموذج. | شكراً لكِ. تم توقيع النموذج. | |
| `consents.sign.viewSigned` | View signed copy | شوفي النسخة الموقّعة | عرض النسخة الموقّعة | |
| `consents.sign.back` | Back to my account | ارجعي لحسابي | العودة إلى حسابي | |
| `consents.sign.errors.notAuthenticated` | Please sign in again to continue. | سجّلي دخولك مرة ثانية عشان تكملين. | يُرجى تسجيل الدخول مرة أخرى للمتابعة. | |
| `consents.sign.errors.notFound` | This form is no longer available. | هذا النموذج ما عاد متاح. | هذا النموذج لم يعد متاحاً. | |
| `consents.sign.errors.signatureRequired` | Please add your signature in the box. | أضيفي توقيعك داخل المربع لو سمحتي. | يُرجى إضافة توقيعك داخل المربع. | |
| `consents.sign.errors.nameRequired` | Please enter your full name. | اكتبي اسمك الكامل لو سمحتي. | يُرجى كتابة اسمك الكامل. | |
| `consents.sign.errors.agreeRequired` | Please confirm that you agree to the form. | أكّدي موافقتك على النموذج لو سمحتي. | يُرجى تأكيد موافقتك على النموذج. | |
| `consents.sign.errors.generic` | Something went wrong. Please try again. | صار خطأ. حاولي مرة ثانية. | حدث خطأ. يُرجى المحاولة مرة أخرى. | |
| `consents.signed.signedBy` | Signed by | الموقّعة | الموقِّعة | |
| `consents.signed.print` | Print | اطبعي | طباعة | |
| `consents.signed.back` | Back to my account | ارجعي لحسابي | العودة إلى حسابي | |
| `impersonation.viewingAs` | You are viewing as {name} | أنتِ تشوفين الموقع باسم {name} | أنتِ تتصفحين الموقع كأنك {name} | |
| `impersonation.blocked` | Not available while viewing as this customer — they need to do this themselves. | — (new) | هذا الإجراء غير متاح أثناء التصفح كأنك العميلة — لازم تسويه هي بنفسها. | |
| `assistant.close` | Close the assistant | سكّري المساعدة | سكّري المحادثة | |
| `invoices.meta.description` | View, print or pay your Lunia invoice. | اطّلعي على فاتورتك من لونيا واطبعيها أو ادفعيها. | عرض فاتورتك من لونيا وطباعتها أو دفعها. | |
| `invoices.view.payOnline` | Pay online | ادفعي أونلاين | الدفع الإلكتروني | |
| `invoices.view.paymentReceived` | Thank you, your payment was received. It can take a minute to show here. | شكراً لك، وصلتنا دفعتك. ممكن تاخذ دقيقة لين تظهر هنا. | شكراً لكِ، تم استلام دفعتك. قد يستغرق ظهورها هنا دقيقة. | |
| `invoices.view.notFound` | This invoice link is not valid. Please ask us to send it again. | رابط الفاتورة غير صالح. تواصلي معنا ونرسله لك من جديد. | رابط الفاتورة غير صالح. يُرجى التواصل معنا لإرساله مجدداً. | |
| `invoices.view.expiredBody` | For your privacy, invoice links work for 60 days. Contact the clinic and we'll send you a fresh link. | حفاظاً على خصوصيتك، تعمل روابط الفواتير لمدة ٦٠ يوماً. تواصل مع المركز وسنرسل لك رابطاً جديداً. | حفاظاً على خصوصيتك، تبقى روابط الفواتير صالحة لمدة 60 يوماً. تواصلي مع المركز وسنرسل لكِ رابطاً جديداً. | |
| `invoices.account.empty` | You have no invoices yet. | ما عندك فواتير للحين. | لا توجد فواتير حتى الآن. | |
| `notFound.body` | The link may be old, or the page may have moved. Everything you need is still a tap away. | يمكن الرابط قديم أو الصفحة انتقلت. كل اللي تحتاجينه لسا قريب منك. | يمكن الرابط قديم أو الصفحة انتقلت. وكل اللي تحتاجينه قريب منك. | |
## Part B: Customer messages (WhatsApp / SMS / email)

New default wording, in `src/modules/comms/templateCatalog.ts`. Templates still holding the original seeded wording are updated automatically on release. Templates staff edited are **not** changed: compare those in Admin → Communications → Message templates.

| Message | Now |
|---|---|
| Booking confirmed | تم تأكيد حجزك في لونيا لـ{{serviceName}} يوم {{dateTime}}. رقم الحجز: {{bookingId}}. بانتظارك، ونتشرف بزيارتك. |
| Reminder (24h) | تذكير: موعدك في لونيا لـ{{serviceName}} بكرة {{dateTime}}. … إذا تبين تغيرين الموعد، كلمينا وبنرتب لك. |
| After the visit | شكراً على زيارتك للونيا لـ{{serviceName}}. إن شاء الله عجبتك التجربة، وننتظرك مرة ثانية. |
| Login code | رمز التحقق من لونيا: {{code}}. صالح لمدة 5 دقائق. لا تشاركين الرمز مع أي أحد. |
| Waitlist spot | خبر حلو! انفتح موعد في لونيا لـ{{serviceName}} اللي كنتِ تنتظرينه. احجزيه الحين قبل لا ينحجز. |
| Review request | شكراً على زيارتك للونيا لـ{{serviceName}}. يهمنا نسمع رأيك في تجربتك، ما ياخذ إلا دقيقة: {{link}} |
| Call-back request | هلا {{name}}، وصلنا طلبك في لونيا. بتتصل فيك وحدة من أخصائياتنا {{when}}. شكراً لك. |
| Invoice | هلا {{name}}، فاتورتك من لونيا رقم {{invoiceNumber}} بمبلغ {{total}} جاهزة. تقدرين تشوفينها وتطبعينها من هنا: {{link}} |
| Package expiring | هلا {{name}}، باقتك {{packageName}} في لونيا باقي فيها {{sessionsLeft}} جلسة، وتنتهي بتاريخ {{expiresOn}}. احجزي جلستك الحين عشان ما تروح عليك: {{link}} |
| We miss you | هلا {{name}}، اشتقنا لك في لونيا! صار لك فترة من آخر زيارة ({{lastService}})، وبشرتك تستاهل شوية اهتمام. احجزي موعدك الجاي من هنا: {{link}} |
| Gift card email | مبروك! وصلتك بطاقة هدية من لونيا بقيمة … ريال. كود البطاقة: … استخدمي الكود وقت الحجز أونلاين أو في المركز. |
| Email greeting | هلا {{name}}، |

## Part C: Database content, suggestions only (nothing changed)

These come from the seeded content, and production probably still matches them. The current text is correct formal Arabic. The suggestions bring it into the website's Gulf voice. Apply the ones you like in the admin page shown.

### Departments (Admin → Catalog → Departments → tagline)

| Department | Current tagline | Suggested |
|---|---|---|
| Skin Quality | عناية مستوحاة من الفلسفة الكورية لبشرة صحية ومتينة | عناية بفلسفة كورية، لبشرة صحية من أساسها |
| Hair & Scalp | نعتني بفروة الرأس كامتداد لجودة البشرة | الشعر الصحي يبدأ من فروة راس صحية |
| Post-Surgery Recovery | عناية داعمة لتعافٍ أسرع وأكثر سلاسة | نوقف معك بعد العملية، لين تتعافين براحة |

### Services (Admin → Catalog → Services → summary)

| Service | Suggested summary |
|---|---|
| Diagnostic Skin Analysis | نصوّر بشرتك ونحللها بدقة: الترطيب، الملمس، وأي شي تحت السطح، وعلى أساسها نبني خطتك في لونيا. |
| Signature Facials & HydraFacial | تنظيف عميق وتقشير وترطيب بجلسة وحدة، نفصّلها على نتيجة تحليل بشرتك عشان إشراقة تبان من أول مرة. |
| LED Light Therapy | ضوء أحمر وأزرق مدروس طبياً يهدّي الالتهاب، يدعم الكولاجين، ويوحّد لون بشرتك مع الجلسات. |
| Microdermabrasion & Peels | تقشير يشيل الطبقة الباهتة ويطلّع بشرة أنعم ولونها أوحد، بدرجة تناسب نتيجة تحليلك. |
| Scalp Diagnostic Analysis | نكبّر ونفحص فروة راسك: كثافة البصيلات وتوازن الزيوت، وعليها نبني كل علاجات شعرك. |
| LED / LLLT Cap Therapy | قبعة ليزر منخفض الطاقة تنشّط البصيلات، وتساعد شعرك يطلع أكثف وأصح مع الجلسات. |
| Scalp Detox | تنظيف عميق يشيل تراكم المنتجات والزيوت، عشان بصيلاتك تشتغل في بيئة نظيفة. |
| Scalp Massage & Oxygen Therapy | تدليك مريح مع علاج بالأكسجين ينشّط الدورة الدموية ويغذي البصيلات من الجذور. |
| Manual Lymphatic Drainage | تدليك لطيف ومتخصص يحرّك السوائل، يخفف التورم بعد العملية ويساعد جسمك يتعافى. |
| Pressotherapy | ضغط هوائي متدرّج يحسّن الدورة الدموية ويساعد يصرّف السوائل الزايدة وقت التعافي. |
| Compression Garment Guidance | نركّب لك مشد الضغط صح ونعلمك عليه، عشان تتعافين براحة وتطلع النتيجة مثل ما تبين. |
| Recovery Lounge | مكان هادي وخاص ترتاحين فيه بين الجلسات، مصمم لراحتك وخصوصيتك بعد العملية. |

Benefit bullets (`benefitsAr`) follow the same voice. Ask and I'll draft them per service.

### Brands (Admin → Catalog → Brands)

The brand descriptions are short formal product copy, and that is acceptable as it is. I'd change only the "why we chose it" lines, so they speak as the clinic («اخترناها لأن…»). Ask and I'll draft them.

### Journal posts (Admin → Catalog → Journal)

Long articles. A dialect pass on full articles is a copywriting job, so it's best done per post by the team or a copywriter. Article bodies can also reasonably stay in formal Arabic.
