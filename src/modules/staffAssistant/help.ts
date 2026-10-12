// The Ask Lunia help library: step-by-step guides for every admin workflow,
// written against the REAL screens. Labels in “curly quotes” are the exact
// button/field/tab text in the UI — tests/staffAssistant/help.test.ts checks
// that each one exists in the admin code and that every link is a real route,
// so a renamed button can't leave the help silently wrong.

import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { matchScore } from "./text";
import type { AssistantGuideView, AssistantLink, AssistantViewer } from "./types";

export interface HelpGuide {
  id: string;
  title: string;
  /** Extra English + Arabic phrases people use for this task. */
  keywords: string[];
  steps: string[];
  links: AssistantLink[];
  /** Viewer needs at least ONE of these (empty = everyone). */
  anyOf: PermissionKey[];
}

const P = PERMISSIONS;
const page = (label: string, href: string): AssistantLink => ({ label, href, kind: "page" });
const form = (label: string, href: string): AssistantLink => ({ label, href, kind: "form" });

export const GUIDES: HelpGuide[] = [
  // ---- Scheduling ------------------------------------------------------------
  {
    id: "book-walk-in",
    title: "Book a walk-in appointment",
    keywords: ["book", "booking", "new appointment", "walk in", "schedule a visit", "حجز", "موعد جديد", "احجز"],
    steps: [
      "Open the calendar and click “Book walk-in” (or click an empty gap in Day view).",
      "Pick a “Service”, set the “Date” and click one of the available times.",
      "Fill in “Customer name” and “Customer phone”.",
      "Click “Confirm walk-in”. The new booking appears on that day.",
    ],
    links: [form("New walk-in booking", "/admin/calendar?add=1"), page("Calendar", "/admin/calendar")],
    anyOf: [P.BOOKING_MANAGE],
  },
  {
    id: "appointment-actions",
    title: "Check in, start, complete, reschedule or cancel an appointment",
    keywords: ["check in", "arrived", "start treatment", "complete", "reschedule", "move appointment", "cancel appointment", "no show", "تسجيل وصول", "اعاده جدوله", "الغاء موعد", "لم يحضر"],
    steps: [
      "Find the appointment in the calendar (Day view shows the next step as a button, plus a ⋯ menu with every action).",
      "Use “Check in” when they arrive, then “Start”, then “Complete”.",
      "To move it, choose “Reschedule”, pick a new “Date” and time, then “Confirm reschedule”.",
      "To cancel, choose “Cancel appointment” and confirm; for a no-show choose “No-show” and confirm with “Mark no-show”.",
    ],
    links: [page("Calendar", "/admin/calendar")],
    anyOf: [P.BOOKING_MANAGE],
  },
  {
    id: "appointment-hub",
    title: "See everything about one visit (Appointment Hub)",
    keywords: ["appointment page", "visit details", "hub", "visit history", "صفحه الموعد", "تفاصيل الزياره"],
    steps: [
      "In the calendar, open an appointment's actions and choose “Open appointment page”.",
      "The page shows the visit, its invoice, the treatment record, documents (“Upload” receipts, lab results, signed forms) and visit comments.",
      "Use “Open 360” in the customer card for the full customer profile.",
    ],
    links: [page("Calendar", "/admin/calendar")],
    anyOf: [P.BOOKING_VIEW],
  },
  {
    id: "waitlist",
    title: "Add someone to the waitlist",
    keywords: ["waitlist", "waiting list", "fully booked", "قائمه الانتظار"],
    steps: [
      "Open Waitlist and fill in “Add a walk-up to the waitlist”: service, desired date, preferred time, name and phone.",
      "Click “Add to waitlist”.",
      "When a slot opens, use “Notify now” on their row.",
    ],
    links: [page("Waitlist", "/admin/waitlist")],
    anyOf: [P.BOOKING_MANAGE],
  },
  // ---- Billing ---------------------------------------------------------------
  {
    id: "new-invoice",
    title: "Check out a customer / create an invoice",
    keywords: ["checkout", "new invoice", "sale", "bill", "charge", "pos", "فاتوره", "فاتوره جديده", "دفع", "محاسبه العميل"],
    steps: [
      "For a booked visit, use “Checkout” on the appointment; for a walk-in sale, click “New sale” in Invoices & payments.",
      "Add items with “Scan barcode or search the catalog” or a “Most sold” tile; “Custom line” adds anything else.",
      "Set qty, “Unit price”, “Discount” and “VAT” per line, and pick the customer with “Find a customer”.",
      "Click “Issue invoice” (or “Save draft” to finish later).",
    ],
    links: [form("New invoice", "/admin/billing/new"), page("Invoices & payments", "/admin/billing")],
    anyOf: [P.BILLING_MANAGE],
  },
  {
    id: "take-payment",
    title: "Take a payment on an invoice",
    keywords: ["payment", "pay", "cash", "mada", "card", "apple pay", "split payment", "record payment", "دفع", "كاش", "مدى", "تحصيل"],
    steps: [
      "Open the issued invoice and go to the “Take payment” card.",
      "Choose the method (Cash, mada, Card, Apple Pay, Bank transfer, Gift card, Package session…).",
      "Enter the amount — a smaller amount lets you split across methods. For cash, enter “Cash received” to see the change due.",
      "Click “Record” — the button shows the amount, e.g. Record 250 SAR. Once paid in full you can print the “Receipt”.",
    ],
    links: [page("Unpaid invoices", "/admin/billing?status=ISSUED")],
    anyOf: [P.BILLING_MANAGE],
  },
  {
    id: "refund",
    title: "Refund a customer (credit note)",
    keywords: ["refund", "credit note", "return", "money back", "reverse invoice", "void invoice", "استرداد", "اشعار دائن", "ارجاع"],
    steps: [
      "Issued invoices are reversed with a credit note (only drafts can be voided, with “Void draft”).",
      "Open the invoice and click “Credit note”.",
      "Set the quantity to credit per line and enter a “Reason”. Tick “Return credited products to stock” if items came back.",
      "To pay money back now, tick the refund option and choose the “Refund method” and “Refund amount”.",
      "Click “Issue credit note”.",
    ],
    links: [page("Invoices & payments", "/admin/billing")],
    anyOf: [P.BILLING_MANAGE],
  },
  {
    id: "send-print-invoice",
    title: "Print or send an invoice",
    keywords: ["print invoice", "receipt", "send invoice", "whatsapp invoice", "email invoice", "pdf", "طباعه", "ايصال", "ارسال فاتوره"],
    steps: [
      "Open the invoice. In the header use “Print A4” or “Receipt”.",
      "To send it, use the “Send to customer” card: choose WhatsApp, SMS or Email and the “Language”, then send.",
    ],
    links: [page("Invoices & payments", "/admin/billing")],
    anyOf: [P.BILLING_MANAGE],
  },
  // ---- Customers --------------------------------------------------------------
  {
    id: "add-lead",
    title: "Add a lead / new customer",
    keywords: ["add lead", "new customer", "new client", "prospect", "enquiry", "عميل جديد", "اضافه عميل", "عميل محتمل"],
    steps: [
      "On Customers, click “Add lead”.",
      "Fill in “Name”, “Phone” (or email), “Source”, “Channel” and “Assign to”.",
      "Click “Add lead”. They appear in the roster and the Leads board.",
    ],
    links: [form("Add lead", "/admin/clients?add=lead"), page("Leads board", "/admin/leads")],
    anyOf: [P.CLIENT_MANAGE],
  },
  {
    id: "edit-customer",
    title: "Edit a customer's details or membership tier",
    keywords: ["edit customer", "change phone", "update email", "change name", "tier", "membership", "تعديل بيانات العميل", "تغيير الرقم", "عضويه"],
    steps: [
      "Open the customer's profile and click “Edit details”.",
      "Change “Name”, “Phone” or “Email” and click “Save details”.",
      "In the same popup, “Membership tier” → pick a tier → “Save tier”.",
    ],
    links: [page("Customers", "/admin/clients")],
    anyOf: [P.CLIENT_MANAGE],
  },
  {
    id: "add-comment",
    title: "Add a note / comment to a customer",
    keywords: ["note", "comment", "remark", "front desk note", "ملاحظه", "تعليق"],
    steps: [
      "Open the customer's profile and go to the “Notes” tab (or use “Add note” in the quick actions).",
      "Type in the “Add comment” box and click “Add comment”.",
      "Use “Pin” to keep an important note at the top.",
    ],
    links: [page("Customers", "/admin/clients")],
    anyOf: [P.VISITNOTE_WRITE],
  },
  {
    id: "bulk-tags",
    title: "Tag or assign many customers at once",
    keywords: ["bulk", "tag customers", "assign owner", "select many", "وسم", "تعيين"],
    steps: [
      "On Customers, tick the customers in the table.",
      "In the bar that appears, type a “Tag” and click “Add tag”, or choose an owner and click “Assign owner”.",
    ],
    links: [page("Customers", "/admin/clients")],
    anyOf: [P.CLIENT_MANAGE],
  },
  {
    id: "loyalty-points",
    title: "Adjust a customer's loyalty points",
    keywords: ["points", "loyalty points", "add points", "نقاط", "ولاء"],
    steps: [
      "Open the customer's profile and go to the “Loyalty” tab.",
      "Enter the points (+ or −) and a “Reason”, then click “Apply adjustment”.",
    ],
    links: [page("Customers", "/admin/clients")],
    anyOf: [P.CLIENT_MANAGE],
  },
  {
    id: "callbacks",
    title: "Work the call-back list",
    keywords: ["call back", "callback", "return call", "phone queue", "اتصال", "معاوده الاتصال"],
    steps: [
      "Open Call-backs (open ones are shown by default).",
      "Use the call button on a card, then log the result under “Log this call” (Reached, Booked, No answer…) and save.",
      "“Book for this customer” jumps straight to a pre-filled booking.",
    ],
    links: [page("Call-backs", "/admin/callbacks")],
    anyOf: [P.CLIENT_VIEW],
  },
  {
    id: "leads-board",
    title: "Move a lead through the pipeline",
    keywords: ["pipeline", "lead stage", "move lead", "sales board", "مسار المبيعات", "مرحله العميل"],
    steps: [
      "Open the Leads board.",
      "Drag a card to another stage (or use its arrow buttons).",
      "Click “Log call” to record a call outcome on the lead.",
    ],
    links: [page("Leads board", "/admin/leads")],
    anyOf: [P.CLIENT_VIEW],
  },
  {
    id: "whatsapp-reply",
    title: "Reply to a WhatsApp message",
    keywords: ["whatsapp", "reply message", "chat", "واتساب", "رد على رساله"],
    steps: [
      "Open WhatsApp and pick the conversation.",
      "Type in the reply box and click “Send”. Use “Assigned to” to hand it to a colleague.",
    ],
    links: [page("WhatsApp", "/admin/whatsapp")],
    anyOf: [P.CLIENT_MANAGE],
  },
  {
    id: "inquiries",
    title: "Handle a website inquiry",
    keywords: ["inquiry", "contact form", "website message", "استفسار"],
    steps: [
      "Open Inquiries and click the inquiry.",
      "Reply with “Reply by email” → “Send email reply”, or link it to a customer.",
      "Back in the list, click “Mark handled”.",
    ],
    links: [page("Inquiries", "/admin/inquiries")],
    anyOf: [P.CMS_MANAGE],
  },
  // ---- Clinical ---------------------------------------------------------------
  {
    id: "consent-sign",
    title: "Have a customer sign a consent form",
    keywords: ["consent", "sign consent", "waiver", "signature", "موافقه", "توقيع", "اقرار"],
    steps: [
      "Open the customer's “Patient file” tab and find the “Consents” card.",
      "Click “Sign at desk”, choose “English” or “العربية”, let them read it, type their name and sign.",
      "They tick the agreement box and click “Sign the form”.",
      "Customers can also sign online from their own account on the website.",
    ],
    links: [page("Customers", "/admin/clients")],
    anyOf: [P.CLINICAL_MANAGE],
  },
  {
    id: "consent-templates",
    title: "Create or edit a consent form template",
    keywords: ["consent template", "new consent form", "edit consent", "نموذج موافقه"],
    steps: [
      "Open Consent forms and click “New form” (or open an existing one).",
      "Fill in the English and Arabic title and text, and pick the services that require it.",
      "Click “Create form” (or “Save”).",
    ],
    links: [page("Consent forms", "/admin/clinical/consents")],
    anyOf: [P.CLINICAL_MANAGE],
  },
  {
    id: "treatment-record",
    title: "Write a treatment record",
    keywords: ["treatment record", "treatment notes", "protocol", "products used", "سجل العلاج", "تقرير جلسه"],
    steps: [
      "From the appointment choose “Add treatment record” (or Patient file → “New record”).",
      "Fill in “Service”, “Performed by” and the date; add settings with “Add setting” and products with “Add product”.",
      "Note any skin reaction and a follow-up date, then click “Save treatment record”.",
    ],
    links: [page("Calendar", "/admin/calendar")],
    anyOf: [P.CLINICAL_MANAGE],
  },
  {
    id: "clinical-photos",
    title: "Upload or compare before/after photos",
    keywords: ["photos", "before after", "upload photo", "compare photos", "صور قبل وبعد", "رفع صوره"],
    steps: [
      "On the customer's “Patient file” tab click “Upload photos”.",
      "Pick the type (Before, After…), add area and notes, then “Take photo” or “Choose files” and “Upload”.",
      "To compare, click “Compare” on two photos and switch between “Slider” and “Side by side”.",
    ],
    links: [page("Customers", "/admin/clients")],
    anyOf: [P.CLINICAL_MANAGE],
  },
  // ---- Inventory --------------------------------------------------------------
  {
    id: "add-product",
    title: "Add a new product",
    keywords: ["new product", "add product", "add item", "منتج جديد", "اضافه منتج"],
    steps: [
      "Open Products & stock and click “New product”.",
      "Fill in the names, barcode/SKU, cost, retail price, “Reorder level” and opening stock.",
      "Click “Create product”.",
    ],
    links: [form("New product", "/admin/inventory/products/new"), page("Products & stock", "/admin/inventory")],
    anyOf: [P.INVENTORY_MANAGE],
  },
  {
    id: "purchase-order",
    title: "Order and receive stock (purchase order)",
    keywords: ["purchase order", "order stock", "receive stock", "reorder", "supplier order", "طلب شراء", "استلام بضاعه"],
    steps: [
      "Open Purchase orders → “New purchase order” (or “Suggest reorder” to pre-fill low-stock items).",
      "Choose the “Supplier”, add products with qty and “Unit cost”, then “Create draft”.",
      "Send it to the supplier and click “Mark as ordered”.",
      "When goods arrive, enter received qty, lot and expiry under “Receive goods” and click “Receive into stock”.",
    ],
    links: [form("Reorder low stock", "/admin/inventory/purchase-orders/new?suggest=1"), page("Purchase orders", "/admin/inventory/purchase-orders")],
    anyOf: [P.INVENTORY_MANAGE],
  },
  {
    id: "stock-take",
    title: "Do a stock-take (count stock)",
    keywords: ["stock take", "stocktake", "count stock", "inventory count", "جرد"],
    steps: [
      "Open Stock-take and use “Find or scan” to find each product.",
      "Enter the counted quantity for each one.",
      "Click “Post stock-take” and confirm with “Post adjustments”.",
    ],
    links: [page("Stock-take", "/admin/inventory/stock-take")],
    anyOf: [P.INVENTORY_MANAGE],
  },
  {
    id: "adjust-stock",
    title: "Write off damaged or expired stock",
    keywords: ["waste", "expired", "damaged", "write off", "stock adjustment", "تالف", "منتهي الصلاحيه"],
    steps: [
      "Open the product page.",
      "Choose the adjustment type (Count correction, Waste / expired / damaged, Return to supplier).",
      "Enter the quantity and a reason, then click “Post adjustment”.",
    ],
    links: [page("Products & stock", "/admin/inventory")],
    anyOf: [P.INVENTORY_MANAGE],
  },
  // ---- Team -------------------------------------------------------------------
  {
    id: "clock-in",
    title: "Clock in or out",
    keywords: ["clock in", "clock out", "attendance", "start shift", "حضور", "انصراف", "تسجيل الدخول للدوام"],
    steps: ["Open “My time & leave” and click “Clock in” (or “Clock out”). You can also clock in from the Today page."],
    links: [page("My time & leave", "/admin/me")],
    anyOf: [],
  },
  {
    id: "request-leave",
    title: "Request leave / vacation",
    keywords: ["leave", "vacation", "day off", "time off", "sick leave", "اجازه", "طلب اجازه"],
    steps: [
      "Open “My time & leave” and go to the “Request leave” section.",
      "Choose the type, the “From” and “To (inclusive)” dates and an optional reason.",
      "Click “Send request”. You can withdraw a pending request with “Cancel”.",
    ],
    links: [page("My time & leave", "/admin/me")],
    anyOf: [],
  },
  {
    id: "approve-leave",
    title: "Approve or reject a leave request",
    keywords: ["approve leave", "reject leave", "leave requests", "الموافقه على الاجازه"],
    steps: ["Open Leave requests, optionally add a note, then click “Approve” or “Reject”."],
    links: [page("Leave requests", "/admin/hr/leave")],
    anyOf: [P.HR_MANAGE],
  },
  {
    id: "payroll",
    title: "Run payroll",
    keywords: ["payroll", "salaries", "payslips", "pay staff", "رواتب", "مسير الرواتب"],
    steps: [
      "Open Payroll, choose the month and click “Create draft run”.",
      "Review the run (use “Recalculate from employee files” if salaries changed).",
      "Click “Approve and lock”, then “Download bank transfer file (CSV)” for the bank.",
      "After paying, click “Mark as paid”.",
    ],
    links: [page("Payroll", "/admin/hr/payroll")],
    anyOf: [P.HR_MANAGE],
  },
  {
    id: "add-team-member",
    title: "Add a team member",
    keywords: ["new staff", "add user", "add employee", "team member", "موظف جديد", "اضافه مستخدم"],
    steps: [
      "Open Users and click “Add team member”.",
      "Fill in name, email and a temporary password, and tick their “Roles”.",
      "Click “Add team member”.",
    ],
    links: [page("Users", "/admin/users")],
    anyOf: [P.STAFF_MANAGE],
  },
  {
    id: "roles",
    title: "Change what a role can access",
    keywords: ["permissions", "role", "access", "صلاحيات", "دور"],
    steps: [
      "Open Roles and click “Edit permissions” on the role.",
      "Tick or untick permissions and click “Save permissions”.",
      "Use “Create role” for a new role.",
    ],
    links: [page("Roles", "/admin/roles")],
    anyOf: [P.STAFF_MANAGE],
  },
  // ---- Marketing / content -------------------------------------------------------
  {
    id: "broadcast",
    title: "Send a WhatsApp / SMS / email broadcast",
    keywords: ["broadcast", "bulk message", "promotion", "send to all customers", "رساله جماعيه", "حمله رسائل"],
    steps: [
      "Open Broadcast, choose the “Channel” and “Language”.",
      "Pick the “Audience” and write the “Message” — {{name}} inserts each customer's first name.",
      "Click “Send broadcast” and confirm.",
    ],
    links: [page("Broadcast", "/admin/comms/broadcast")],
    anyOf: [P.MARKETING_MANAGE],
  },
  {
    id: "message-templates",
    title: "Edit an automatic message (confirmation, reminder…)",
    keywords: ["message template", "confirmation message", "reminder message", "whatsapp template", "قالب رساله", "رساله التاكيد"],
    steps: [
      "Open Message templates and use “Choose a message to view or edit”.",
      "Edit the “Message content” (click placeholder chips to insert them); the preview shows exactly what the customer gets.",
      "Click “Save template”. “Reset to default” restores the original wording.",
    ],
    links: [page("Message templates", "/admin/comms/templates")],
    anyOf: [P.SETTINGS_MANAGE],
  },
  {
    id: "campaign-spend",
    title: "Record marketing campaign spend",
    keywords: ["campaign", "ad spend", "marketing spend", "حمله اعلانيه", "مصاريف التسويق"],
    steps: [
      "Open Campaigns (Marketing → “Manage campaign spend”).",
      "Fill in the channel, month and “Amount (SAR)”, then click “Save spend”.",
    ],
    links: [page("Campaigns", "/admin/marketing/campaigns")],
    anyOf: [P.MARKETING_MANAGE],
  },
  {
    id: "edit-website-home",
    title: "Change the website home page text",
    keywords: ["website", "home page", "headline", "website text", "الموقع", "الصفحه الرئيسيه"],
    steps: [
      "Open Website content and choose Home.",
      "Edit the headline, call to action and intro in English and Arabic.",
      "Click “Save”.",
    ],
    links: [page("Website content", "/admin/content")],
    anyOf: [P.CMS_MANAGE],
  },
  {
    id: "catalog-items",
    title: "Add or edit a service, department, brand or blog post",
    keywords: ["service price", "add service", "edit service", "department", "brand", "blog post", "خدمه جديده", "سعر الخدمه", "مقال"],
    steps: [
      "Open Catalog and choose Services, Departments, Brands or Blog.",
      "To add one, use the create form at the top of the page (e.g. “Create service”).",
      "To change one, click “Edit” on its row, update it and click “Save” — a service's duration and price are under booking settings.",
    ],
    links: [page("Services", "/admin/catalog/services"), page("Catalog", "/admin/catalog")],
    anyOf: [P.CMS_MANAGE],
  },
  {
    id: "gift-cards",
    title: "Issue a gift card",
    keywords: ["gift card", "voucher", "بطاقه هديه", "قسيمه"],
    steps: [
      "Open Gift cards & packages.",
      "Enter the amount, optionally a customer and an expiry date, and click “Issue gift card”.",
    ],
    links: [page("Gift cards & packages", "/admin/commerce")],
    anyOf: [P.SETTINGS_MANAGE],
  },
  {
    id: "packages",
    title: "Create or sell a treatment package",
    keywords: ["package", "sessions package", "bundle", "باقه", "جلسات"],
    steps: [
      "Open Gift cards & packages.",
      "Create one with the names, sessions and price, then “Create package”.",
      "To sell one, use “Record a package purchase”: pick the customer and package, then “Record purchase”.",
    ],
    links: [page("Gift cards & packages", "/admin/commerce")],
    anyOf: [P.SETTINGS_MANAGE],
  },
  {
    id: "tiers",
    title: "Set up membership tiers and points",
    keywords: ["tiers", "vip", "membership levels", "points rate", "مستويات العضويه"],
    steps: [
      "Open Loyalty tiers. Use “Create tier” with a name, priority and discount.",
      "Under the points setup, set how many SAR earn a point and how many points equal 1 SAR, then “Save rates”.",
    ],
    links: [page("Loyalty tiers", "/admin/tiers")],
    anyOf: [P.SETTINGS_MANAGE],
  },
  {
    id: "reports",
    title: "Run and export a report",
    keywords: ["report", "export", "excel", "csv", "download data", "تقرير", "تصدير"],
    steps: [
      "Open Reports and choose the report (Bookings, Revenue, Customers or Marketing).",
      "Set the from/to dates and click “Run report”.",
      "Click “Export CSV” to download it.",
    ],
    links: [page("Reports", "/admin/reports")],
    anyOf: [P.ANALYTICS_VIEW],
  },
  {
    id: "settings",
    title: "Change opening hours or business settings",
    keywords: ["opening hours", "working hours", "business info", "otp", "settings", "ساعات العمل", "اعدادات"],
    steps: [
      "Open Settings. Sections: Business, Hours, Social, SEO defaults and Communications.",
      "Edit what you need and click “Save”. The one-time code channel also controls how customers sign in on the website.",
    ],
    links: [page("Settings", "/admin/settings")],
    anyOf: [P.SETTINGS_MANAGE],
  },
  // ---- Using the system -----------------------------------------------------------
  {
    id: "display",
    title: "Switch to Arabic or dark mode",
    keywords: ["arabic", "language", "dark mode", "theme", "night mode", "عربي", "اللغه", "الوضع الداكن"],
    steps: ["Click the half-moon “Display” button in the top bar.", "Choose English or العربية, and Match device, Light or Dark. It's remembered on this device."],
    links: [],
    anyOf: [],
  },
  {
    id: "shortcuts",
    title: "Search and keyboard shortcuts",
    keywords: ["shortcuts", "keyboard", "search", "find anything", "command palette", "اختصارات", "بحث"],
    steps: [
      "Press Ctrl/⌘ K (or /) to search customers, invoices, products and pages from anywhere.",
      "Press ? to see all shortcuts — e.g. g c opens the calendar, n b starts a new booking.",
    ],
    links: [],
    anyOf: [],
  },
  {
    id: "edit-request",
    title: "Ask the owners to change something in the system",
    keywords: ["edit request", "change request", "suggest a change", "report a problem", "bug", "طلب تعديل", "اقتراح"],
    steps: [
      "In this assistant, tap “Request an edit” (or just say what should change).",
      "Describe what should change and why, pick a priority, and send it.",
      "Ask “my requests” any time to see its status.",
    ],
    links: [],
    anyOf: [],
  },
];

export function guidesFor(viewer: AssistantViewer): HelpGuide[] {
  return GUIDES.filter((g) => g.anyOf.length === 0 || g.anyOf.some((p) => viewer.permissions.has(p)));
}

/** Guides relevant to a question, best first (only ones this viewer may use). */
export function matchGuides(query: string, viewer: AssistantViewer): { guide: HelpGuide; score: number }[] {
  return guidesFor(viewer)
    .map((guide) => ({ guide, score: matchScore(query, [guide.title, ...guide.keywords]) }))
    .filter((m) => m.score >= 0.4)
    .sort((a, b) => b.score - a.score);
}

export function guideToView(g: HelpGuide): AssistantGuideView {
  return { id: g.id, title: g.title, steps: g.steps };
}
