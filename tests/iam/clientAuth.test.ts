import { describe, it, expect, afterEach, afterAll } from "vitest";
import {
  requestOtp,
  verifyOtp,
  createClientSession,
  getClientSessionUser,
  destroyClientSession,
} from "@/modules/iam/clientAuth";
import { createSession, destroySession } from "@/modules/iam/session";
import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/db";

let phoneCounter = 0;
function uniquePhone(): string {
  phoneCounter += 1;
  return `+9665${Date.now()}${phoneCounter}`;
}

const createdUserIds: string[] = [];
const usedPhones: string[] = [];

afterEach(async () => {
  const ids = createdUserIds.splice(0);
  for (const id of ids) {
    await prisma.clientProfile.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  const phones = usedPhones.splice(0);
  for (const phone of phones) {
    await getRedis().del(`otp:${phone}`, `otpreq:${phone}`, `otpver:${phone}`);
  }
});

afterAll(async () => {
  getRedis().disconnect();
});

describe("clientAuth", () => {
  it("requestOtp returns a devCode in test env and stores the matching code in redis", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const { devCode } = await requestOtp(phone);
    expect(devCode).toMatch(/^\d{6}$/);

    const raw = await getRedis().get(`otp:${phone}`);
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw as string) as { code: string };
    expect(record.code).toBe(devCode);
  });

  it("throws when requestOtp is called beyond the hourly rate limit", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    for (let i = 0; i < 5; i++) {
      await requestOtp(phone);
    }
    await expect(requestOtp(phone)).rejects.toThrow();
  });

  it("verifyOtp with the correct code creates a CLIENT user + ClientProfile and clears the code", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const { devCode } = await requestOtp(phone);
    const result = await verifyOtp(phone, devCode as string);
    expect(result).not.toBeNull();
    createdUserIds.push((result as { userId: string }).userId);

    const user = await prisma.user.findUnique({ where: { id: (result as { userId: string }).userId } });
    expect(user?.type).toBe("CLIENT");
    expect(user?.phone).toBe(phone);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: (result as { userId: string }).userId },
    });
    expect(profile).not.toBeNull();

    const raw = await getRedis().get(`otp:${phone}`);
    expect(raw).toBeNull();
  });

  it("verifyOtp with a wrong code returns null", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const { devCode } = await requestOtp(phone);
    const wrongCode = devCode === "111111" ? "222222" : "111111";
    const result = await verifyOtp(phone, wrongCode);
    expect(result).toBeNull();
  });

  it("verifyOtp after the code was already consumed returns null", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const { devCode } = await requestOtp(phone);
    const first = await verifyOtp(phone, devCode as string);
    expect(first).not.toBeNull();
    createdUserIds.push((first as { userId: string }).userId);

    const second = await verifyOtp(phone, devCode as string);
    expect(second).toBeNull();
  });

  it("verifyOtp invalidates the code atomically once the wrong-attempt cap is hit, even for a subsequent correct guess", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const { devCode } = await requestOtp(phone);
    const wrongCode = devCode === "111111" ? "222222" : "111111";

    for (let i = 0; i < 5; i++) {
      const result = await verifyOtp(phone, wrongCode);
      expect(result).toBeNull();
    }

    // The 6th attempt, even with the correct code, must fail: the cap already
    // invalidated the OTP via the atomic otpver:<phone> counter.
    const result = await verifyOtp(phone, devCode as string);
    expect(result).toBeNull();

    const raw = await getRedis().get(`otp:${phone}`);
    expect(raw).toBeNull();
  });

  it("requesting a fresh OTP resets the verify-attempt budget, so a mistake-prone user isn't locked out of the new code", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const first = await requestOtp(phone);
    const wrongCode = first.devCode === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i++) {
      expect(await verifyOtp(phone, wrongCode)).toBeNull();
    }
    // The old code's attempt budget is now exhausted -- even its own correct
    // code would be rejected (already covered by the "invalidates the code
    // atomically" test above).

    // Requesting a brand-new code must reset the attempt counter...
    const second = await requestOtp(phone);
    expect(second.devCode).toMatch(/^\d{6}$/);

    // ...so verifying with the NEW correct code succeeds.
    const result = await verifyOtp(phone, second.devCode as string);
    expect(result).not.toBeNull();
    createdUserIds.push((result as { userId: string }).userId);
  });

  it("verifyOtp records the given sourceChannel on a brand-new client's ClientProfile", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const { devCode } = await requestOtp(phone);
    const result = await verifyOtp(phone, devCode as string, { sourceChannel: "instagram" });
    expect(result).not.toBeNull();
    const userId = (result as { userId: string }).userId;
    createdUserIds.push(userId);

    const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { userId } });
    expect(profile.sourceChannel).toBe("instagram");
  });

  it("getClientSessionUser returns the user for a CLIENT session token, and null for a STAFF user's token", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const { devCode } = await requestOtp(phone);
    const verified = await verifyOtp(phone, devCode as string);
    const userId = (verified as { userId: string }).userId;
    createdUserIds.push(userId);

    const clientToken = await createClientSession(userId);
    expect(await getClientSessionUser(clientToken)).toEqual({ id: userId });

    await destroyClientSession(clientToken);
    expect(await getClientSessionUser(clientToken)).toBeNull();

    const staff = await prisma.user.create({
      data: { type: "STAFF", email: `test-staff-${Date.now()}@lunia.local`, isActive: true },
    });
    createdUserIds.push(staff.id);
    const staffToken = await createSession(staff.id);
    try {
      expect(await getClientSessionUser(staffToken)).toBeNull();
    } finally {
      await destroySession(staffToken);
    }
  });
});
