import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { complete } from "@/modules/booking/bookings";
import { consumeForBooking, setServiceConsumables, listServiceConsumables } from "@/modules/inventory/consumables";
import { PREFIX, makeProduct, sweepInventoryTestData, uid } from "./helpers";

beforeAll(sweepInventoryTestData);
afterAll(sweepInventoryTestData);

// A private, unpublished service so no other suite's bookings ever consume
// this suite's products (and vice versa).
async function makeService() {
  const department = await prisma.department.findFirstOrThrow();
  const slug = uid("svc").toLowerCase();
  return prisma.service.create({
    data: {
      slug,
      departmentId: department.id,
      nameEn: slug,
      nameAr: slug,
      summaryEn: "",
      summaryAr: "",
      benefitsEn: [],
      benefitsAr: [],
      isPublished: false,
    },
  });
}

let phoneCounter = 0;
async function makeBooking(serviceIds: string[], status: "CHECKED_IN" | "CONFIRMED" = "CHECKED_IN") {
  phoneCounter += 1;
  const user = await prisma.user.create({
    data: {
      type: "CLIENT",
      phone: `+966${PREFIX}${Date.now()}${phoneCounter}`,
      clientProfile: { create: { fullName: "Inventory Test" } },
    },
    include: { clientProfile: true },
  });
  const room = await prisma.room.findFirstOrThrow();
  const start = new Date(Date.now() - 2 * 3_600_000);
  return prisma.booking.create({
    data: {
      clientProfileId: user.clientProfile!.id,
      status,
      appointments: {
        create: serviceIds.map((serviceId) => ({
          serviceId,
          staffUserId: user.id,
          roomId: room.id,
          startAt: start,
          endAt: new Date(start.getTime() + 3_600_000),
        })),
      },
    },
    include: { appointments: true },
  });
}

describe("service consumables", () => {
  it("replaces a service's bill of materials", async () => {
    const service = await makeService();
    const a = await makeProduct();
    const b = await makeProduct();
    await setServiceConsumables({ serviceId: service.id, items: [{ productId: a.id, qty: 2 }] });
    await setServiceConsumables({ serviceId: service.id, items: [{ productId: b.id, qty: 5 }] });
    const bom = await listServiceConsumables(service.id);
    expect(bom.map((i) => [i.productId, i.qty])).toEqual([[b.id, 5]]);
    await expect(
      setServiceConsumables({ serviceId: service.id, items: [{ productId: a.id, qty: 1 }, { productId: a.id, qty: 2 }] }),
    ).rejects.toThrow();
  });
});

describe("auto-consumption on booking completion", () => {
  it("deducts consumables once per appointment, even if run again or concurrently", async () => {
    const serviceA = await makeService();
    const serviceB = await makeService();
    const gel = await makeProduct({ stockQty: 10, costMinor: 150 });
    const gloves = await makeProduct({ stockQty: 1 });
    await setServiceConsumables({ serviceId: serviceA.id, items: [{ productId: gel.id, qty: 3 }, { productId: gloves.id, qty: 2 }] });
    await setServiceConsumables({ serviceId: serviceB.id, items: [{ productId: gel.id, qty: 1 }] });

    const booking = await makeBooking([serviceA.id, serviceB.id]);
    const completed = await complete(booking.id);
    expect(completed.status).toBe("COMPLETED");

    let gelNow = await prisma.product.findUniqueOrThrow({ where: { id: gel.id } });
    // 3 (service A) + 1 (service B)
    expect(gelNow.stockQty).toBe(6);
    // Allowed to go negative rather than blocking completion.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: gloves.id } })).stockQty).toBe(-1);

    const movements = await prisma.stockMovement.findMany({
      where: { refType: "APPOINTMENT", refId: { in: booking.appointments.map((a) => a.id) } },
    });
    expect(movements).toHaveLength(3);
    expect(movements.every((m) => m.type === "CONSUMPTION" && m.qty < 0)).toBe(true);
    expect(movements.find((m) => m.productId === gel.id && m.qty === -3)?.unitCostMinor).toBe(150);

    // Re-running (sequentially or concurrently) never double-deducts.
    expect(await consumeForBooking(booking.id)).toEqual({ movements: 0 });
    const again = await Promise.all([consumeForBooking(booking.id), consumeForBooking(booking.id)]);
    expect(again.map((r) => r.movements)).toEqual([0, 0]);
    gelNow = await prisma.product.findUniqueOrThrow({ where: { id: gel.id } });
    expect(gelNow.stockQty).toBe(6);
  });

  it("is race-safe when two completions consume concurrently", async () => {
    const service = await makeService();
    const gel = await makeProduct({ stockQty: 10 });
    await setServiceConsumables({ serviceId: service.id, items: [{ productId: gel.id, qty: 4 }] });
    const booking = await makeBooking([service.id]);
    const results = await Promise.all([consumeForBooking(booking.id), consumeForBooking(booking.id), consumeForBooking(booking.id)]);
    expect(results.map((r) => r.movements).sort()).toEqual([0, 0, 1]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: gel.id } })).stockQty).toBe(6);
  });

  it("does nothing for services without consumables", async () => {
    const service = await makeService();
    const booking = await makeBooking([service.id], "CONFIRMED");
    const completed = await complete(booking.id);
    expect(completed.status).toBe("COMPLETED");
    expect(await prisma.stockMovement.count({ where: { refType: "APPOINTMENT", refId: booking.appointments[0].id } })).toBe(0);
  });
});
