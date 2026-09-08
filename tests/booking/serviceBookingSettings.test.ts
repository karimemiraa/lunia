import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { updateServiceBookingSettings } from "@/modules/booking/serviceSettings";
import { setServiceAccessRule, getMinTierForService } from "@/modules/booking/accessRules";

async function getUnGatedService() {
  return prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });
}

describe("updateServiceBookingSettings", () => {
  it("updates duration/price/onlineBookable/inCenterOnly, then restores the originals", async () => {
    const original = await getUnGatedService();
    try {
      await updateServiceBookingSettings(original.id, {
        durationMin: 45,
        priceMinor: 12345,
        onlineBookable: false,
        inCenterOnly: true,
      });
      const updated = await prisma.service.findUniqueOrThrow({ where: { id: original.id } });
      expect(updated.durationMin).toBe(45);
      expect(updated.priceMinor).toBe(12345);
      expect(updated.onlineBookable).toBe(false);
      expect(updated.inCenterOnly).toBe(true);
    } finally {
      await updateServiceBookingSettings(original.id, {
        durationMin: original.durationMin,
        priceMinor: original.priceMinor,
        onlineBookable: original.onlineBookable,
        inCenterOnly: original.inCenterOnly,
      });
    }
  });

  it("rejects durationMin <= 0 and priceMinor < 0", async () => {
    const service = await getUnGatedService();
    await expect(
      updateServiceBookingSettings(service.id, {
        durationMin: 0,
        priceMinor: 0,
        onlineBookable: true,
        inCenterOnly: false,
      }),
    ).rejects.toThrow();
    await expect(
      updateServiceBookingSettings(service.id, {
        durationMin: 30,
        priceMinor: -1,
        onlineBookable: true,
        inCenterOnly: false,
      }),
    ).rejects.toThrow();
  });

  it("throws for an unknown service id", async () => {
    await expect(
      updateServiceBookingSettings("does-not-exist", {
        durationMin: 30,
        priceMinor: 0,
        onlineBookable: true,
        inCenterOnly: false,
      }),
    ).rejects.toThrow(/not found/);
  });
});

describe("setServiceAccessRule", () => {
  it("sets, then clears, a minimum tier gate", async () => {
    const service = await getUnGatedService();
    const tier = await prisma.membershipTier.findFirstOrThrow();
    try {
      await setServiceAccessRule(service.id, tier.id);
      expect((await getMinTierForService(service.id))?.minTierId).toBe(tier.id);

      await setServiceAccessRule(service.id, null);
      expect(await getMinTierForService(service.id)).toBeNull();
    } finally {
      await prisma.serviceAccessRule.deleteMany({ where: { serviceId: service.id } });
    }
  });

  it("throws for an unknown tier id", async () => {
    const service = await getUnGatedService();
    await expect(setServiceAccessRule(service.id, "does-not-exist")).rejects.toThrow(/not found/);
  });

  it("throws for an unknown service id", async () => {
    const tier = await prisma.membershipTier.findFirstOrThrow();
    await expect(setServiceAccessRule("does-not-exist", tier.id)).rejects.toThrow(/not found/);
  });
});
