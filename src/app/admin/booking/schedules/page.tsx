import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listStaffOptions } from "@/modules/booking/bookings";
import { getSchedulesForStaff } from "@/modules/booking/staffSchedules";
import { StaffPicker } from "./StaffPicker";
import { ScheduleForm } from "./ScheduleForm";
import { getStaffDisplay } from "../../_i18n/display";
import { makeT } from "../../_i18n/t";
import { loadArabicNames } from "../../calendar/arabicNames";

interface SchedulesPageProps {
  searchParams: Promise<{ staffUserId?: string }>;
}

export default async function SchedulesPage({ searchParams }: SchedulesPageProps) {
  const user = await requireAdmin(PERMISSIONS.STAFF_MANAGE);
  const { locale } = await getStaffDisplay();
  const t = makeT(locale);
  const staffOptionsEn = await listStaffOptions();
  // Arabic mode: staff names from StaffProfile.fullNameAr (English fallback).
  const arNames = await loadArabicNames(locale, { staffUserIds: staffOptionsEn.map((s) => s.id) });
  const staffOptions = staffOptionsEn.map((s) => ({ ...s, name: arNames.staff.get(s.id) ?? s.name }));

  const params = await searchParams;
  const staffUserId =
    params.staffUserId && staffOptions.some((staff) => staff.id === params.staffUserId)
      ? params.staffUserId
      : (staffOptions[0]?.id ?? "");

  const schedule = staffUserId ? await getSchedulesForStaff(staffUserId) : [];

  return (
    <AdminShell user={user} title="Staff Schedules" description="Set each staff member's weekly working hours.">
      {staffOptions.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/70">{t("No staff members found.")}</p>
      ) : (
        <>
          <StaffPicker staffOptions={staffOptions} staffUserId={staffUserId} />
          <ScheduleForm key={staffUserId} staffUserId={staffUserId} schedule={schedule} />
        </>
      )}
    </AdminShell>
  );
}
