// Extra notification-center sources contributed by feature modules (call-backs,
// low stock, leave requests, expiring documents, unpaid invoices...). Each
// source decides for itself whether the viewer may see it (by permission) and
// returns a count plus its newest items. Register new sources in SOURCES.

import type { PermissionKey } from "@/modules/iam/permissions";
import type { NotificationItem } from "../feed";

export interface NotificationSourceResult {
  count: number;
  items: NotificationItem[];
}

export type NotificationSource = (permissions: Set<PermissionKey>) => Promise<NotificationSourceResult>;

export const SOURCES: NotificationSource[] = [];
