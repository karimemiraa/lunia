import { describe, it, expect, afterAll } from "vitest";
import { createTreatmentRecord, listTreatmentRecords } from "@/modules/clinical/treatments";
import { prisma } from "@/lib/db";
import { cleanupUsers, makeClient, makeStaff } from "./helpers";

const users: string[] = [];
const roles: string[] = [];
afterAll(() => cleanupUsers(users, roles));

describe("treatment records", () => {
  it("stores ordered settings/products and lists them with names", async () => {
    const c = await makeClient();
    const s = await makeStaff([]);
    users.push(c.userId, s.userId);
    roles.push(s.roleId);
    const service = await prisma.service.findFirstOrThrow();

    await createTreatmentRecord({
      clientProfileId: c.clientProfileId,
      serviceId: service.id,
      performedById: s.userId,
      performedAt: "2026-09-20T10:00:00+03:00",
      settings: [
        { key: "Passes", value: "3" },
        { key: "Device", value: "Hydrafacial" },
      ],
      productsUsed: [{ name: "Serum", qty: "2", unit: "ml" }],
      skinReaction: "Mild redness",
    });
    const [row] = await listTreatmentRecords(c.clientProfileId);
    expect(row.serviceName).toBe(service.nameEn);
    expect(row.settings.map((x) => x.key)).toEqual(["Passes", "Device"]);
    expect(row.productsUsed[0]).toMatchObject({ name: "Serum", qty: "2", unit: "ml" });
    expect(row.performedAt.toISOString()).toBe("2026-09-20T07:00:00.000Z");
  });

  it("rejects a performer who is not staff and an appointment of another customer", async () => {
    const c = await makeClient();
    const other = await makeClient();
    users.push(c.userId, other.userId);
    await expect(
      createTreatmentRecord({ clientProfileId: c.clientProfileId, performedById: other.userId, performedAt: new Date() }),
    ).rejects.toThrow(/staff member/);

    const appt = await prisma.appointment.findFirst({ where: { booking: { clientProfileId: { not: c.clientProfileId } } } });
    if (appt) {
      const s = await makeStaff([]);
      users.push(s.userId);
      roles.push(s.roleId);
      await expect(
        createTreatmentRecord({ clientProfileId: c.clientProfileId, appointmentId: appt.id, performedById: s.userId, performedAt: new Date() }),
      ).rejects.toThrow(/Appointment not found/);
    }
  });
});
