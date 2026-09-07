import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getSetting, setSetting, getAllSettings, type BusinessSettings } from "@/modules/cms/settings";

describe("settings service", () => {
  it("round-trips a valid business setting through setSetting and getSetting", async () => {
    const original = await prisma.siteSetting.findUnique({ where: { key: "business" } });
    try {
      const value: BusinessSettings = {
        nameEn: "Test Business",
        nameAr: "عمل تجريبي",
        addressEn: "123 Test St, Riyadh",
        addressAr: "١٢٣ شارع تجريبي، الرياض",
        phone: "+9665XXXXXXXX",
        whatsapp: "+9665XXXXXXXX",
        email: "test@example.com",
      };

      await setSetting("business", value);
      const fetched = await getSetting("business");
      expect(fetched).toEqual(value);
    } finally {
      // Restore whatever was there before (seeded default), or delete if none.
      if (original) {
        await prisma.siteSetting.update({ where: { key: "business" }, data: { value: original.value! } });
      } else {
        await prisma.siteSetting.deleteMany({ where: { key: "business" } });
      }
    }
  });

  it("throws when setSetting is called with an invalid value (missing whatsapp)", async () => {
    const invalid = {
      nameEn: "Test Business",
      nameAr: "عمل تجريبي",
      addressEn: "123 Test St, Riyadh",
      addressAr: "١٢٣ شارع تجريبي، الرياض",
      phone: "+9665XXXXXXXX",
      email: "test@example.com",
      // whatsapp missing
    } as unknown as BusinessSettings;

    await expect(setSetting("business", invalid)).rejects.toThrow();
  });

  it("returns null from getSetting for a key that has no row", async () => {
    const original = await prisma.siteSetting.findUnique({ where: { key: "hero" } });
    try {
      await prisma.siteSetting.deleteMany({ where: { key: "hero" } });
      expect(await getSetting("hero")).toBeNull();
    } finally {
      if (original) {
        await prisma.siteSetting.upsert({
          where: { key: "hero" },
          update: { value: original.value! },
          create: { key: "hero", value: original.value! },
        });
      }
    }
  });

  it("getAllSettings returns all known settings that currently exist", async () => {
    const businessValue: BusinessSettings = {
      nameEn: "All Settings Co",
      nameAr: "كل الإعدادات",
      addressEn: "1 Somewhere Rd",
      addressAr: "١ مكان ما",
      phone: "+9665XXXXXXXX",
      whatsapp: "+9665XXXXXXXX",
      email: "all@example.com",
    };
    const original = await prisma.siteSetting.findUnique({ where: { key: "business" } });
    try {
      await setSetting("business", businessValue);
      const all = await getAllSettings();
      expect(all.business).toEqual(businessValue);
    } finally {
      if (original) {
        await prisma.siteSetting.update({ where: { key: "business" }, data: { value: original.value! } });
      } else {
        await prisma.siteSetting.deleteMany({ where: { key: "business" } });
      }
    }
  });
});
