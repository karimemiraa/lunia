// Commission, specialist discounts and the role clean-up
// (docs/PRD-commission-discounts-roles.md). Voice: docs/arabic-glossary.md.
const pay: Record<string, string> = {
  // Roles & permissions
  "Give discounts on own visits (up to the limit)": "منح خصم على زياراتها (ضمن الحد المسموح)",
  "Approve discounts above the limit": "الموافقة على الخصومات فوق الحد",
  "You can only add or remove permissions you have yourself.": "تقدر تضيف أو تشيل الصلاحيات اللي عندك أنت فقط.",
  "You can only give or take away roles within your own permissions.": "تقدر تعطي أو تسحب أدوار ضمن صلاحياتك أنت فقط.",
  "You can't delete someone with more access than you.": "ما تقدر تحذف شخص صلاحياته أكثر منك.",
  "Services & prices": "الخدمات والأسعار",
  "Brands & blog": "العلامات والمدونة",

  // HR file + service editor
  "Services commission (%)": "عمولة الخدمات (٪)",
  "Of what customers paid for her services, after discounts, excluding VAT. A service's own rate wins.": "من المبلغ اللي دفعته العميلات مقابل خدماتها، بعد الخصم وبدون الضريبة. نسبة الخدمة الخاصة تُقدَّم إن وُجدت.",
  "Products commission (%)": "عمولة المنتجات (٪)",
  "Of homecare products she sold, after discounts, excluding VAT": "من منتجات العناية المنزلية اللي باعتها، بعد الخصم وبدون الضريبة",
  "Discount limit without approval (%)": "حد الخصم بدون موافقة (٪)",
  "Leave blank to use the default in Settings → Discounts": "اتركه فاضي لاستخدام الحد الافتراضي في الإعدادات ← الخصومات",
  "Discount limit must be a whole number between 0 and 100%": "حد الخصم لازم يكون رقم صحيح بين 0 و100٪",
  "Commission for this service (%)": "عمولة هذه الخدمة (٪)",
  "Leave blank to use each specialist's services % from her HR file.": "اتركه فاضي لاستخدام نسبة كل أخصائية من ملفها الوظيفي.",

  // Invoice editor
  "Done by": "نفّذتها",
  "Sold by": "باعته",
  "No one (no commission)": "لا أحد (بدون عمولة)",

  // My time & pay
  "My commission": "عمولتي",
  "On what customers paid, after discounts, excluding VAT. Final figures are on your payslip.": "على المبالغ المدفوعة فعلاً، بعد الخصم وبدون الضريبة. الأرقام النهائية في كشف راتبك.",
  "{month} so far": "{month} حتى الحين",
  "Services and package sessions": "الخدمات وجلسات الباقات",
  "at {pct}%": "بنسبة {pct}٪",
  "Products sold": "المنتجات المباعة",
  Item: "البند",
  Refund: "استرجاع",
  "Nothing yet this month — commission appears once a customer's invoice is fully paid.": "لا شيء هذا الشهر بعد — تظهر العمولة لما تُدفع فاتورة العميلة كاملة.",
  "Last month ({month}): {amount}": "الشهر الماضي ({month}): {amount}",

  // Specialist discount on a visit
  "Give a discount": "منح خصم",
  "Discount {pct}% waiting for approval": "خصم {pct}٪ بانتظار الموافقة",
  "Discount {pct}% ({amount} SAR)": "خصم {pct}٪ ({amount} ريال)",
  "Discount approved": "تمت الموافقة على الخصم",
  "Discount declined": "تم رفض الخصم",
  "Remove discount": "إزالة الخصم",
  "Discount removed": "تمت إزالة الخصم",
  "Sent to a manager for approval": "أُرسل للمديرة للموافقة",
  "Discount added — it will be on the invoice": "تمت إضافة الخصم — بيظهر في الفاتورة",
  "Discount type": "نوع الخصم",
  "Other reason…": "سبب آخر…",
  "Why?": "ليش؟",
  "Save discount": "حفظ الخصم",
  "Could not save the discount": "تعذّر حفظ الخصم",
  "Returning customer": "عميلة دائمة",
  "Session ran over": "الجلسة طوّلت",
  "Introductory offer": "عرض تعريفي",
  "Service recovery": "تعويض عن تجربة غير مرضية",
  "Family or friend of a regular": "قريبة أو صديقة عميلة دائمة",

  // Discount errors (src/modules/booking/discounts.ts)
  "You don't have permission to give discounts.": "ما عندك صلاحية منح خصومات.",
  "Say why you're giving the discount.": "اكتب سبب الخصم.",
  "You can only discount your own customers.": "تقدرين تعطين خصم لعميلاتك فقط.",
  "This visit is already closed.": "هذه الزيارة مقفلة.",
  "The invoice is already issued — ask the front desk for a credit note instead.": "الفاتورة صادرة — اطلبي من الاستقبال إشعار دائن بدلاً من ذلك.",
  "This visit has no price to discount.": "هذه الزيارة ما لها سعر للخصم.",
  "Enter a discount above zero.": "أدخلي خصم أكبر من صفر.",
  "The discount can't be more than the visit price.": "الخصم ما يتجاوز سعر الزيارة.",
  "Only a manager can approve discounts.": "الموافقة على الخصومات للمديرة فقط.",
  "There's no discount waiting on this visit.": "ما في خصم بانتظار الموافقة على هذه الزيارة.",
  "Someone else just decided this discount — refresh and try again.": "زميلة أخرى قررت في هذا الخصم للتو — حدّث الصفحة وحاول مرة ثانية.",
  "You can only remove a discount you gave.": "تقدرين تشيلين الخصم اللي أعطيتيه أنتِ فقط.",
  "Appointment not found.": "الموعد غير موجود.",

  // Settings → Discounts
  "Specialists can discount their own customers up to this limit; anything above goes to a manager to approve. A person's HR file can set her own limit.": "تقدر الأخصائية تعطي عميلاتها خصم لين هذا الحد؛ وأي شيء فوقه يروح للمديرة للموافقة. ويمكن تحديد حد خاص لكل موظفة في ملفها الوظيفي.",
  "Without approval, up to (%)": "بدون موافقة، لين (٪)",
  "And at most (SAR, optional)": "وبحد أقصى (ريال، اختياري)",
  "Save discount settings": "حفظ إعدادات الخصم",
  "Enter an amount like 100 or leave it empty.": "أدخل مبلغ مثل 100 أو اتركه فاضي.",
  "Couldn't save discount settings.": "تعذّر حفظ إعدادات الخصم.",

  Reason: "السبب",
  Discounts: "الخصومات",
  Decline: "رفض",

  // Reports → Discounts
  "Given by": "منحته",
  "Approved by": "وافقت عليه",
  Applied: "مُطبّق",
  "Front desk": "الاستقبال",
  "Whole invoice": "الفاتورة كاملة",

  // Notifications
  "Discount to approve": "خصم بانتظار موافقتك",
  "Discounts to approve": "خصومات بانتظار الموافقة",
};

export default pay;
