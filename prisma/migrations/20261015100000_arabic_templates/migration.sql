-- Native Gulf Arabic wording for the seeded Arabic message templates.
-- Only rows still holding the original seeded text change; anything staff
-- edited in Communications → Message templates is left alone.
UPDATE "MessageTemplate" SET "bodyTemplate" = 'تم تأكيد حجزك في لونيا لـ{{serviceName}} يوم {{dateTime}}. بانتظارك، ونتشرف بزيارتك.', "updatedAt" = now()
WHERE "kind" = 'CONFIRMATION' AND "locale" = 'ar' AND "channel" = 'whatsapp' AND "bodyTemplate" = 'تم تأكيد حجزك في لونيا لخدمة {{serviceName}} بتاريخ {{dateTime}}. نتطلع لرؤيتك قريباً.';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'تذكير: موعدك في لونيا لـ{{serviceName}} بكرة، {{dateTime}}. إذا تبين تغيرين الموعد كلمينا وبنرتب لك.', "updatedAt" = now()
WHERE "kind" = 'REMINDER_24H' AND "locale" = 'ar' AND "channel" = 'whatsapp' AND "bodyTemplate" = 'تذكير: موعدك في لونيا لخدمة {{serviceName}} غداً الساعة {{dateTime}}. نراك قريباً!';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'شكراً على زيارتك للونيا لـ{{serviceName}}. إن شاء الله عجبتك التجربة، وننتظرك مرة ثانية.', "updatedAt" = now()
WHERE "kind" = 'POST_VISIT' AND "locale" = 'ar' AND "channel" = 'whatsapp' AND "bodyTemplate" = 'شكراً لزيارتك لونيا لخدمة {{serviceName}}. نتمنى أن تكون تجربتك ممتازة.';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'رمز التحقق من لونيا: {{code}}. لا تشاركينه مع أي أحد.', "updatedAt" = now()
WHERE "kind" = 'OTP' AND "locale" = 'ar' AND "channel" = 'sms' AND "bodyTemplate" = 'رمز التحقق الخاص بك في لونيا هو {{code}}.';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'رمز التحقق من لونيا: {{code}}. صالح لمدة 5 دقائق، ولا تشاركينه مع أي أحد.', "updatedAt" = now()
WHERE "kind" = 'OTP' AND "locale" = 'ar' AND "channel" = 'email' AND "bodyTemplate" = 'رمز التحقق الخاص بك في لونيا هو {{code}}. صالح لمدة ٥ دقائق.';

-- Rows saved from the template studio with the old default wording, unchanged since.
UPDATE "MessageTemplate" SET "bodyTemplate" = 'هلا {{name}}، باقتك {{packageName}} في لونيا باقي فيها {{sessionsLeft}} جلسة، وتنتهي بتاريخ {{expiresOn}}.

احجزي جلستك الحين عشان ما تروح عليك:
{{link}}', "updatedAt" = now()
WHERE "kind" = 'PACKAGE_EXPIRING' AND "locale" = 'ar' AND "bodyTemplate" = 'هلا {{name}}، باقتك {{packageName}} في لونيا باقي فيها {{sessionsLeft}} جلسة وتنتهي بتاريخ {{expiresOn}}.

احجزي جلستك الحين عشان ما تضيع:
{{link}}';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'هلا {{name}}، اشتقنا لك في لونيا!

صار لك فترة من آخر زيارة ({{lastService}})، وبشرتك تستاهل شوية اهتمام. احجزي موعدك الجاي من هنا:
{{link}}', "updatedAt" = now()
WHERE "kind" = 'WIN_BACK' AND "locale" = 'ar' AND "bodyTemplate" = 'هلا {{name}}، اشتقنا لك في لونيا!

صار لك فترة من آخر زيارة ({{lastService}}). بشرتك تستاهل اهتمام — احجزي موعدك القادم من هنا:
{{link}}';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'تم تأكيد حجزك في لونيا لـ{{serviceName}} يوم {{dateTime}}.

رقم الحجز: {{bookingId}}

بانتظارك، ونتشرف بزيارتك.', "updatedAt" = now()
WHERE "kind" = 'CONFIRMATION' AND "locale" = 'ar' AND "bodyTemplate" = 'تم تأكيد حجزك في لونيا لخدمة {{serviceName}} بتاريخ {{dateTime}}.

رقم الحجز: {{bookingId}}

نتشرّف بزيارتك ونتطلّع للقائك قريباً.';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'تذكير: موعدك في لونيا لـ{{serviceName}} بكرة {{dateTime}}.

رقم الحجز: {{bookingId}}

إذا تبين تغيرين الموعد، كلمينا وبنرتب لك.', "updatedAt" = now()
WHERE "kind" = 'REMINDER_24H' AND "locale" = 'ar' AND "bodyTemplate" = 'تذكير ودّي: موعدك في لونيا لخدمة {{serviceName}} غداً {{dateTime}}.

رقم الحجز: {{bookingId}}

إذا رغبت بتعديل الموعد، تواصل معنا وبكل سرور.';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'شكراً على زيارتك للونيا لـ{{serviceName}}.

إن شاء الله عجبتك التجربة، وننتظرك مرة ثانية.', "updatedAt" = now()
WHERE "kind" = 'POST_VISIT' AND "locale" = 'ar' AND "bodyTemplate" = 'شكراً لزيارتك لونيا لخدمة {{serviceName}}.

نتمنّى أن تكون تجربتك مميّزة، ويسعدنا رؤيتك من جديد.';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'رمز التحقق من لونيا: {{code}}

صالح لمدة 5 دقائق. لا تشاركين الرمز مع أي أحد.', "updatedAt" = now()
WHERE "kind" = 'OTP' AND "locale" = 'ar' AND "bodyTemplate" = 'رمز الدخول إلى لونيا هو {{code}}

صالح لمدة ٥ دقائق. لا تشارك هذا الرمز مع أحد.';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'خبر حلو! انفتح موعد في لونيا لـ{{serviceName}} اللي كنتِ تنتظرينه.

احجزيه الحين قبل لا ينحجز.', "updatedAt" = now()
WHERE "kind" = 'WAITLIST_OPEN' AND "locale" = 'ar' AND "bodyTemplate" = 'بشرى سارّة! تم فتح موعد في لونيا لخدمة {{serviceName}} كنت بانتظاره.

سارع بالحجز قبل أن يُحجز.';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'شكراً على زيارتك للونيا لـ{{serviceName}}.

يهمنا نسمع رأيك في تجربتك، ما ياخذ إلا دقيقة:
{{link}}', "updatedAt" = now()
WHERE "kind" = 'REVIEW_REQUEST' AND "locale" = 'ar' AND "bodyTemplate" = 'شكراً لزيارتك لونيا لخدمة {{serviceName}}.

يسعدنا سماع رأيك عن تجربتك:
{{link}}';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'هلا {{name}}، وصلنا طلبك في لونيا.

بتتصل فيك وحدة من أخصائياتنا {{when}}.

شكراً لك.', "updatedAt" = now()
WHERE "kind" = 'CALLBACK_ACK' AND "locale" = 'ar' AND "bodyTemplate" = 'هلا {{name}}، وصلنا طلبك في لونيا.

بتتصل فيك أخصائية {{when}}.

شكراً لك.';
UPDATE "MessageTemplate" SET "bodyTemplate" = 'هلا {{name}}، فاتورتك من لونيا رقم {{invoiceNumber}} بمبلغ {{total}} جاهزة. تقدرين تشوفينها وتطبعينها من هنا:
{{link}}

{{payLine}}', "updatedAt" = now()
WHERE "kind" = 'INVOICE' AND "locale" = 'ar' AND "bodyTemplate" = 'أهلاً {{name}}، فاتورتك من لونيا رقم {{invoiceNumber}} بمبلغ {{total}} جاهزة، تقدرين تشوفينها وتطبعينها من هنا:
{{link}}

{{payLine}}';
