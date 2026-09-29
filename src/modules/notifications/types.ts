// Client-safe notification vocabulary (no DB imports). feed.ts re-exports
// these for server callers; client components import from here.

export type NotificationType =
  | "inquiry"
  | "whatsapp"
  | "lead"
  | "booking"
  | "callback"
  | "stock"
  | "leave"
  | "document"
  | "invoice";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string | null;
  href: string;
  at: Date;
}

export interface NotificationFeed {
  total: number;
  /** True open count per type (not just the items shown). */
  counts: Partial<Record<NotificationType, number>>;
  items: NotificationItem[];
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  inquiry: "Inquiries",
  whatsapp: "WhatsApp",
  lead: "New leads",
  booking: "New bookings",
  callback: "Call-backs due",
  stock: "Stock alerts",
  leave: "Leave requests",
  document: "Expiring documents",
  invoice: "Unpaid invoices",
};

// Where "see all" of a type lives.
export const NOTIFICATION_TYPE_HREF: Record<NotificationType, string> = {
  inquiry: "/admin/inquiries",
  whatsapp: "/admin/whatsapp",
  lead: "/admin/leads",
  booking: "/admin/calendar",
  callback: "/admin/callbacks",
  stock: "/admin/inventory",
  leave: "/admin/hr/leave",
  document: "/admin/hr",
  invoice: "/admin/billing?status=ISSUED",
};
