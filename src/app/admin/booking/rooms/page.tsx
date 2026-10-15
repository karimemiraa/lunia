import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listRooms } from "@/modules/booking/rooms";
import { RoomRow } from "./RoomRow";
import { CreateRoomForm } from "./CreateRoomForm";
import { getStaffT } from "../../_i18n/display";

export default async function RoomsPage() {
  const user = await requireAdmin(PERMISSIONS.STAFF_MANAGE);
  const rooms = await listRooms();
  const t = await getStaffT();

  return (
    <AdminShell user={user} title="Rooms" description="Manage the treatment rooms used for scheduling appointments.">
      <div className="mb-8 max-w-2xl">
        <CreateRoomForm />
      </div>

      <div className="overflow-x-auto lunia-card">
        <table className="w-full text-start text-sm" data-testid="rooms-table">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Name")}</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Capacity")}</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Order")}</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Active")}</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Save")}</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Delete")}</th>
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                  {t("No rooms yet.")}
                </td>
              </tr>
            ) : (
              rooms.map((room) => <RoomRow key={room.id} room={room} />)
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
