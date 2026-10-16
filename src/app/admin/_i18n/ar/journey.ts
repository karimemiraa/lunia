// The in-clinic visit journey: visit board, arrival alerts, visit timeline and
// flow report (docs/PRD-visit-journey.md). Voice: docs/arabic-glossary.md.
const journey: Record<string, string> = {
  // Page
  "Visit board": "لوحة الزيارات",
  "Every customer in the clinic right now — who is waiting, who has her, and what comes next.": "كل العميلات في المركز الحين — مين تنتظر، ومين معها، ووش الخطوة الجاية.",
  Everyone: "الكل",
  "My customers": "عميلاتي",
  "Turn on arrival alerts": "تفعيل تنبيهات الوصول",

  // Columns
  "Expected today": "متوقعة اليوم",
  "Booked today, not here yet": "محجوزة اليوم ولم تصل بعد",
  "Checked in, waiting to be received": "سجّلت حضورها وتنتظر الاستلام",
  Consultation: "الاستشارة",
  "With the specialist before treatment": "مع الأخصائية قبل العلاج",
  "In the treatment room": "داخل غرفة العلاج",
  "Paying and booking the next visit": "الدفع وحجز الموعد القادم",
  "Left today": "غادرت اليوم",
  "Visit finished": "انتهت الزيارة",
  "No one here": "لا يوجد أحد",

  // Right-now strip
  "Waiting now": "في الانتظار الحين",
  "Longest: {n} min": "الأطول: {n} د",
  "No one waiting": "لا أحد ينتظر",
  "With a specialist": "مع الأخصائيات",
  "Consultation or treatment": "استشارة أو علاج",
  "At checkout": "عند المحاسبة",
  "Paying or booking next visit": "دفع أو حجز الموعد القادم",
  "Arriving within the hour": "يصلن خلال ساعة",
  "Left today: {n}": "غادرن اليوم: {n}",

  // Rooms
  Free: "متاحة",
  "Busy until {time}": "مشغولة حتى {time}",
  "Being prepared · {n} min left": "قيد التجهيز · باقي {n} د",
  Ready: "جاهزة",

  // Prayer
  Fajr: "الفجر",
  Dhuhr: "الظهر",
  Asr: "العصر",
  Maghrib: "المغرب",
  Isha: "العشاء",
  "{prayer} prayer in {n} min": "صلاة {prayer} بعد {n} د",
  "{prayer} prayer at {time}": "صلاة {prayer} الساعة {time}",

  // Card timers
  "Late by {n} min": "متأخرة {n} د",
  "Due at {time}": "موعدها {time}",
  "Waiting {n} min": "تنتظر منذ {n} د",
  "Consultation {n} min": "استشارة منذ {n} د",
  "{n} of {planned} min": "{n} من {planned} د",
  "At the desk {n} min": "عند المحاسبة منذ {n} د",
  "Visit took {n} min": "مدة الزيارة {n} د",
  "received by {name}": "استلمتها {name}",

  // Card flags
  "First visit": "أول زيارة",
  "Consultation first": "استشارة أولاً",
  "Let in unpaid": "دخلت قبل الدفع",
  "Pay before treatment": "الدفع قبل العلاج",
  "Consent to sign: {n}": "موافقات للتوقيع: {n}",
  "No health profile": "لا يوجد ملف صحي",
  "Coffee served": "تم تقديم الضيافة",

  // Card actions
  "{name} checked in": "تم تسجيل حضور {name}",
  Receive: "استلام",
  "Receive for consultation": "استلام للاستشارة",
  "You have {name}": "استلمتِ {name}",
  "Take the payment first, or let her in without payment.": "تحصيل المبلغ أولاً، أو السماح بالدخول قبل الدفع.",
  "Hand to…": "تحويل إلى…",
  "No other specialist is free right now.": "لا توجد أخصائية أخرى متاحة الحين.",
  "Hand to another specialist": "تحويل لأخصائية أخرى",
  "Choose a specialist": "اختيار الأخصائية",
  "Handed over": "تم التحويل",
  "To the treatment room": "إلى غرفة العلاج",
  "Finish treatment": "إنهاء العلاج",
  "Sent to checkout": "تم تحويلها للمحاسبة",
  "Book next visit": "حجز الموعد القادم",
  "Check out": "تسجيل المغادرة",
  "{name} checked out": "غادرت {name}",
  "Let in without payment": "السماح بالدخول قبل الدفع",
  "Why is she going in before paying? (saved on the visit)": "سبب الدخول قبل الدفع؟ (يُحفظ في سجل الزيارة)",
  "Could not update the visit": "تعذّر تحديث الزيارة",

  // Arrival alerts
  "{name} has arrived": "وصلت {name}",
  "She is waiting for you. Open the visit board to receive her.": "تنتظرك الحين. افتحي لوحة الزيارات لاستلامها.",
  "She is waiting for you.": "تنتظرك الحين.",

  // Journey errors (src/modules/booking/journey.ts)
  "This customer hasn't been checked in yet.": "لم يتم تسجيل حضور هذه العميلة بعد.",
  "Someone else just updated this visit — refresh and try again.": "زميلة أخرى حدّثت هذه الزيارة للتو — حدّث الصفحة وحاول مرة ثانية.",
  "This service is paid before treatment — take the payment first, or let her in without payment.": "هذه الخدمة تُدفع قبل العلاج — يجب تحصيل المبلغ أولاً، أو السماح بالدخول قبل الدفع.",
  "That specialist isn't free at this time.": "هذه الأخصائية غير متاحة في هذا الوقت.",
  "Only the front desk or this customer's specialist can do that.": "هذا الإجراء للاستقبال أو لأخصائية هذه العميلة فقط.",

  // Visit timeline (appointment page)
  "Visit timeline": "مسار الزيارة",
  arrived: "وصلت",
  received: "استلمتها الأخصائية",
  treatment_started: "دخلت غرفة العلاج",
  treatment_finished: "انتهى العلاج",
  checked_out: "غادرت",
  reassigned: "تم التحويل",
  hospitality: "قُدّمت الضيافة",
  payment_override: "دخلت قبل الدفع",
  "by {name}": "بواسطة {name}",
  "to {name}": "إلى {name}",
  "Waited {n} min": "انتظرت {n} د",
  "Treatment {n} min": "العلاج {n} د",
  "Checkout {n} min": "المحاسبة {n} د",
  "Total {n} min": "الإجمالي {n} د",
  "The timeline starts when she is checked in.": "يبدأ المسار عند تسجيل حضورها.",
  "Open the visit board": "فتح لوحة الزيارات",

  // Settings + service flags
  "Visit journey": "رحلة الزيارة",
  "Waiting turns amber after (min)": "الانتظار يصير أصفر بعد (دقيقة)",
  "Waiting turns red after (min)": "الانتظار يصير أحمر بعد (دقيقة)",
  "Checkout flagged after (min)": "تنبيه المحاسبة بعد (دقيقة)",
  "Room preparation time (min)": "مدة تجهيز الغرفة (دقيقة)",
  "Show the next prayer time on the visit board": "عرض وقت الصلاة القادمة في لوحة الزيارات",
  "Save journey settings": "حفظ إعدادات الرحلة",
  "How the visit board flags customers who have waited too long.": "متى تنبّه لوحة الزيارات على العميلات اللي طال انتظارهن.",
  "Red must be later than amber.": "الأحمر لازم يكون بعد الأصفر.",
  "Couldn't save journey settings.": "تعذّر حفظ إعدادات الرحلة.",
  "Paid before treatment": "يُدفع قبل العلاج",
  "Customers pay at reception before going to the treatment room.": "تدفع العميلة في الاستقبال قبل دخول غرفة العلاج.",
  "Starts with a consultation": "تبدأ باستشارة",
  "Every visit begins with a consultation step (first visits always do).": "كل زيارة تبدأ بخطوة استشارة (وأول زيارة دائماً).",

  // Flow report
  "Visit flow": "سير الزيارات",
  "Visits": "الزيارات",
  "Average wait": "متوسط الانتظار",
  "Longest wait": "أطول انتظار",
  "Received on time": "استُلمت في وقتها",
  "Average overrun": "متوسط التجاوز",
  "Average at checkout": "متوسط المحاسبة",
  "Average visit": "متوسط الزيارة",
  "{n} min": "{n} د",
  "Within {n} min of arriving": "خلال {n} د من الوصول",
  "Beyond the planned treatment time": "زيادة عن مدة العلاج المخططة",
  "By specialist": "حسب الأخصائية",
  "Average wait (min)": "متوسط الانتظار (دقيقة)",
  "Average overrun (min)": "متوسط التجاوز (دقيقة)",
};

export default journey;
