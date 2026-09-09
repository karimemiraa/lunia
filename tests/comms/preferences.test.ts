import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  getPreference,
  upsertPreference,
  prefToChannel,
  resolveDeliveryChannel,
  DEFAULT_PREFERENCE,
} from "@/modules/comms/preferences";

const NAME_TAG = `preftest-${Date.now()}`;
const createdUserIds: string[] = [];

async function makeClient(): Promise<string> {
  const user = await prisma.user.create({
    data: { type: "CLIENT", clientProfile: { create: { fullName: NAME_TAG } } },
    include: { clientProfile: true },
  });
  createdUserIds.push(user.id);
  return user.clientProfile!.id;
}

afterEach(async () => {
  if (createdUserIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
});

describe("preferences service", () => {
  it("returns defaults when no row exists", async () => {
    const cp = await makeClient();
    expect(await getPreference(cp)).toEqual(DEFAULT_PREFERENCE);
  });

  it("upserts and reads back a preference", async () => {
    const cp = await makeClient();
    await upsertPreference(cp, { channel: "EMAIL", marketingOptIn: false });
    const pref = await getPreference(cp);
    expect(pref.channel).toBe("EMAIL");
    expect(pref.marketingOptIn).toBe(false);
    expect(pref.remindersOptIn).toBe(true);
    // Partial update leaves other fields intact.
    await upsertPreference(cp, { remindersOptIn: false });
    const pref2 = await getPreference(cp);
    expect(pref2.channel).toBe("EMAIL");
    expect(pref2.remindersOptIn).toBe(false);
  });
});

describe("prefToChannel / resolveDeliveryChannel", () => {
  it("maps explicit prefs; AUTO => null", () => {
    expect(prefToChannel("EMAIL")).toBe("email");
    expect(prefToChannel("SMS")).toBe("sms");
    expect(prefToChannel("WHATSAPP")).toBe("whatsapp");
    expect(prefToChannel("AUTO")).toBeNull();
  });

  it("prefers explicit preference, then global default, then identifier", () => {
    expect(resolveDeliveryChannel({ preferenceChannel: "EMAIL", globalDefault: "whatsapp" })).toBe("email");
    expect(resolveDeliveryChannel({ preferenceChannel: "AUTO", globalDefault: "sms" })).toBe("sms");
    expect(resolveDeliveryChannel({ preferenceChannel: "AUTO", identifierKind: "email" })).toBe("email");
    expect(resolveDeliveryChannel({ identifierKind: "phone" })).toBe("sms");
  });
});
