import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listRooms } from "@/modules/booking/rooms";
import { RoomRow } from "./RoomRow";
import { CreateRoomForm } from "./CreateRoomForm";

export default async function RoomsPage() {
  const user = await requireAdmin(PERMISSIONS.STAFF_MANAGE);
  const rooms = await listRooms();

  return (
    <AdminShell user={user} title="Rooms" description="Manage the treatment rooms used for scheduling appointments.">
      <div className="mb-8 max-w-2xl">
        <CreateRoomForm />
      </div>

      <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
        <table className="w-full text-left text-sm" data-testid="rooms-table">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Name</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Capacity</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Order</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Active</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Save</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Delete</th>
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                  No rooms yet.
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
