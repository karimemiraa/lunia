import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getStaffUserFromRequest } from "@/modules/iam/requestAuth";
import { listClients, applyRosterView, ROSTER_VIEWS, type RosterView, type ClientLifecycle } from "@/modules/crm/clients";
import { toCsv } from "@/modules/reports/csv";

const COLUMNS = [
  { key: "fullName", label: "Customer" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "stage", label: "Stage" },
  { key: "ownerName", label: "Owner" },
  { key: "source", label: "Source" },
  { key: "tierName", label: "Tier" },
  { key: "tags", label: "Tags" },
  { key: "ltvSar", label: "LTV (SAR)" },
  { key: "owedSar", label: "Outstanding (SAR)" },
  { key: "bookingCount", label: "Bookings" },
  { key: "lastVisitAt", label: "Last visit" },
  { key: "nextAppointmentAt", label: "Next appointment" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Customer since" },
];

const iso = (d: Date | undefined) => (d ? d.toISOString().slice(0, 10) : "");

// GET /admin/clients/export?<same filters as the roster> — the current view as CSV.
export async function GET(request: Request) {
  const user = await getStaffUserFromRequest(request);
  if (!user) return new NextResponse(null, { status: 401 });
  if (!user.permissions.has(PERMISSIONS.CLIENT_VIEW)) return new NextResponse(null, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const get = (k: string) => sp.get(k)?.trim() || undefined;
  const view = (ROSTER_VIEWS as readonly string[]).includes(sp.get("view") ?? "") ? (sp.get("view") as RosterView) : "all";
  const status = get("status") as ClientLifecycle | undefined;

  let rows = await listClients({ search: get("search"), tierKey: get("tierKey"), source: get("source"), tag: get("tag"), stage: get("stage"), ownerId: get("ownerId"), direction: get("direction") });
  rows = applyRosterView(rows, view);
  if (status) rows = rows.filter((r) => r.status === status);

  const csv = toCsv(
    COLUMNS,
    rows.map((r) => ({
      fullName: r.fullName,
      phone: r.phone ?? "",
      email: r.email ?? "",
      stage: r.stage,
      ownerName: r.ownerName ?? "",
      source: r.source ?? "",
      tierName: r.tierName ?? "",
      tags: r.tags.join("; "),
      ltvSar: (r.ltvMinor / 100).toFixed(2),
      owedSar: (r.owedMinor / 100).toFixed(2),
      bookingCount: r.bookingCount,
      lastVisitAt: iso(r.lastVisitAt),
      nextAppointmentAt: iso(r.nextAppointmentAt),
      status: r.status,
      createdAt: iso(r.createdAt),
    })),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${view}-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
