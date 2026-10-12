// Staff-console display preferences: language (English default, opt-in Arabic
// + RTL) and colour theme. Both live in cookies so the server renders the
// right <html lang/dir/data-theme> on the first byte (no flash, no mismatch).
// Plain data + pure helpers: safe to import from server and client components.

export type StaffLocale = "en" | "ar";
export type StaffTheme = "system" | "light" | "dark";

export const STAFF_LOCALE_COOKIE = "lunia_staff_locale";
export const STAFF_THEME_COOKIE = "lunia_staff_theme";

export function parseStaffLocale(value: string | undefined | null): StaffLocale {
  return value === "ar" ? "ar" : "en";
}

export function parseStaffTheme(value: string | undefined | null): StaffTheme {
  return value === "light" || value === "dark" ? value : "system";
}

// Arabic for the console chrome: sidebar, breadcrumbs, command palette, top bar
// and shortcuts. Keyed by the English string so call sites stay readable and any
// string without an entry simply falls back to English. Page bodies are not
// translated (yet) — this covers the frame staff navigate with every day.
const AR: Record<string, string> = {
  // Nav groups
  Overview: "نظرة عامة",
  Customers: "العملاء",
  Scheduling: "المواعيد",
  Finance: "المالية",
  Inventory: "المخزون",
  Team: "الفريق",
  Commerce: "المبيعات",
  Marketing: "التسويق",
  Content: "المحتوى",
  System: "النظام",
  "Front desk": "الاستقبال",
  Operations: "التشغيل",
  Growth: "النمو",
  Pinned: "المثبّتة",
  "Pin to top": "تثبيت في الأعلى",
  Unpin: "إلغاء التثبيت",
  Show: "إظهار",
  Hide: "إخفاء",
  // Nav items
  Dashboard: "لوحة اليوم",
  Business: "الأعمال",
  Reports: "التقارير",
  Notifications: "الإشعارات",
  Leads: "العملاء المحتملون",
  "Call-backs": "طلبات الاتصال",
  "Chat assistant": "المساعد الذكي",
  "Consent forms": "نماذج الموافقة",
  Calendar: "التقويم",
  Waitlist: "قائمة الانتظار",
  Rooms: "الغرف",
  Schedules: "جداول العمل",
  "Invoices & payments": "الفواتير والمدفوعات",
  Accounting: "المحاسبة",
  Expenses: "المصروفات",
  "Products & stock": "المنتجات والمخزون",
  "Purchase orders": "أوامر الشراء",
  Suppliers: "الموردون",
  "My time & leave": "وقتي وإجازاتي",
  Employees: "الموظفون",
  Attendance: "الحضور",
  "Leave requests": "طلبات الإجازة",
  Payroll: "الرواتب",
  "Gift cards & packages": "بطاقات الهدايا والباقات",
  "Loyalty tiers": "مستويات الولاء",
  Campaigns: "الحملات",
  Broadcast: "رسائل جماعية",
  WhatsApp: "واتساب",
  Inquiries: "الاستفسارات",
  Reviews: "التقييمات",
  Media: "الوسائط",
  Catalog: "الكتالوج",
  Settings: "الإعدادات",
  Communications: "الاتصالات",
  Users: "المستخدمون",
  Roles: "الأدوار",
  "Audit log": "سجل التدقيق",
  "Edit requests": "طلبات التعديل",
  "Results gallery": "معرض النتائج",
  Superadmin: "المشرف العام",
  // Quick actions (palette)
  "New booking": "حجز جديد",
  "New walk-in invoice": "فاتورة زيارة مباشرة",
  "Add lead": "إضافة عميل محتمل",
  "Clock in / out": "تسجيل الحضور / الانصراف",
  "Open website": "فتح الموقع",
  // Shell chrome
  Website: "الموقع",
  "Sign out": "تسجيل الخروج",
  "Collapse sidebar": "طي القائمة",
  "Expand sidebar": "توسيع القائمة",
  "Open menu": "فتح القائمة",
  "Close menu": "إغلاق القائمة",
  "Admin navigation": "قائمة الإدارة",
  Breadcrumb: "مسار التنقل",
  Close: "إغلاق",
  // Command palette
  "Search or jump to…": "ابحث أو انتقل إلى…",
  "Searching records…": "جارٍ البحث في السجلات…",
  "Type a name, phone, invoice number, SKU, or a page…": "اكتب اسمًا أو رقم هاتف أو رقم فاتورة أو رمز منتج أو صفحة…",
  Pages: "الصفحات",
  Actions: "إجراءات",
  Recent: "الأخيرة",
  Results: "النتائج",
  "No matches.": "لا توجد نتائج.",
  "Search and jump to": "البحث والانتقال",
  "Search customers, bookings, invoices, products, pages and actions": "ابحث في العملاء والحجوزات والفواتير والمنتجات والصفحات والإجراءات",
  "No matches for": "لا توجد نتائج لـ",
  "Try a customer name or phone, an invoice number, a product SKU or barcode, or a page name.": "جرّب اسم عميل أو رقم هاتفه، أو رقم فاتورة، أو رمز منتج أو باركود، أو اسم صفحة.",
  "Open full search": "فتح البحث الكامل",
  navigate: "للتنقّل",
  open: "للفتح",
  Press: "اضغط",
  "for all shortcuts": "لعرض كل الاختصارات",
  // Record search groups
  Bookings: "الحجوزات",
  Invoices: "الفواتير",
  Products: "المنتجات",
  "Chat sessions": "جلسات المساعد",
  // Notification bell
  "View all": "عرض الكل",
  "You’re all caught up.": "لا يوجد جديد.",
  "Mark as seen": "تمييز كمقروء",
  "Mark all as seen": "تمييز الكل كمقروء",
  "Sending digests…": "جارٍ إرسال الملخصات…",
  "Email digests to assignees": "إرسال ملخص بالبريد للمسؤولين",
  // Keyboard shortcuts
  "Keyboard shortcuts": "اختصارات لوحة المفاتيح",
  "Search or jump to anything": "ابحث أو انتقل إلى أي شيء",
  "Show keyboard shortcuts": "عرض اختصارات لوحة المفاتيح",
  "Close dialogs": "إغلاق النوافذ",
  "Go to dashboard": "الانتقال إلى لوحة اليوم",
  "Go to calendar": "الانتقال إلى التقويم",
  "Go to customers": "الانتقال إلى العملاء",
  "Go to invoices & payments": "الانتقال إلى الفواتير والمدفوعات",
  "Go to products & stock": "الانتقال إلى المنتجات والمخزون",
  "Go to notifications": "الانتقال إلى الإشعارات",
  "New booking (walk-in)": "حجز جديد (زيارة مباشرة)",
  "Press the keys in sequence, outside a text field.": "اضغط المفاتيح بالتتابع خارج حقول الكتابة.",
  Admin: "الإدارة",
  "Opens today in the calendar": "يفتح تقويم اليوم",
  "Blank invoice for a walk-in sale": "فاتورة فارغة لبيع مباشر",
  "Opens the Add lead form": "يفتح نموذج «إضافة عميل محتمل»",
  "Opens in a new tab": "يفتح في علامة تبويب جديدة",
  // Display menu
  Display: "العرض",
  Language: "اللغة",
  Theme: "المظهر",
  "Match device": "حسب الجهاز",
  Light: "فاتح",
  Dark: "داكن",
  // Ask Lunia (team assistant)
  "Ask Lunia": "اسأل لونيا",
  "Team assistant": "مساعد الفريق",
  "Open the team assistant": "فتح مساعد الفريق",
  "Close the assistant": "إغلاق المساعد",
  "Ask about a page, a task or a number…": "اسأل عن صفحة أو مهمة أو رقم…",
  Send: "إرسال",
  "Ask a question…": "اكتب سؤالك…",
  "Thinking…": "جارٍ التفكير…",
  "Clear chat": "مسح المحادثة",
  "Request an edit": "طلب تعديل",
  "What should change?": "ما الذي يجب تغييره؟",
  "Short title": "عنوان مختصر",
  Details: "التفاصيل",
  Priority: "الأولوية",
  Low: "منخفضة",
  Normal: "عادية",
  High: "عالية",
  "Send request": "إرسال الطلب",
  Cancel: "إلغاء",
  "Request sent — the owners will review it.": "تم إرسال الطلب — سيراجعه المسؤولون.",
  "Hi! I can take you to any page, explain how to do something, give you live numbers, or send an edit request to the owners.":
    "مرحبًا! أستطيع نقلك إلى أي صفحة، وشرح طريقة تنفيذ أي مهمة، وعرض الأرقام الحالية، أو إرسال طلب تعديل للمسؤولين.",
  "Answered by Claude": "الإجابة من Claude",
  "Steps": "الخطوات",
  "Opening…": "جارٍ الفتح…",
};

/** Translate a chrome string for the staff locale; unknown strings fall back to English. */
export function st(text: string, locale: StaffLocale): string {
  return locale === "ar" ? (AR[text] ?? text) : text;
}
