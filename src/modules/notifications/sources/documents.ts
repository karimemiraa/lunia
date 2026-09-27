// Employee documents (iqama / national ID, passport, contract) that have
// expired or expire within DOCUMENT_WARN_DAYS.

import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { DOCUMENT_WARN_DAYS } from "@/modules/hr/constants";
import { documentFlags } from "@/modules/hr/employees";
import { isoToDate, addDays, todayISO } from "@/modules/hr/dates";
import type { NotificationItem } from "../feed";
import type { NotificationSource } from "./index";

export const documentSource: NotificationSource = async (permissions) => {
  if (!permissions.has(PERMISSIONS.HR_MANAGE)) return { count: 0, items: [] };
  const today = todayISO();
  const horizon = isoToDate(addDays(today, DOCUMENT_WARN_DAYS));
  const records = await prisma.employeeRecord.findMany({
    where: {
      user: { isActive: true },
      OR: [{ nationalIdExpiry: { lte: horizon } }, { passportExpiry: { lte: horizon } }, { contractEnd: { lte: horizon } }],
    },
    include: { user: { select: { email: true, staffProfile: { select: { fullName: true } } } } },
  });

  const items: NotificationItem[] = [];
  for (const r of records) {
    const name = r.user.staffProfile?.fullName || r.user.email || "Staff";
    for (const flag of documentFlags(r, today)) {
      items.push({
        id: `doc-${r.userId}-${flag.kind}`,
        type: "document",
        title: `${flag.label} ${flag.status === "expired" ? "expired" : "expiring"} — ${name}`,
        subtitle:
          flag.status === "expired"
            ? `Expired ${flag.expiryISO}`
            : `Expires ${flag.expiryISO} (in ${flag.daysLeft} day${flag.daysLeft === 1 ? "" : "s"})`,
        href: `/admin/hr/${r.userId}`,
        at: isoToDate(flag.expiryISO),
      });
    }
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { count: items.length, items: items.slice(0, 5) };
};
