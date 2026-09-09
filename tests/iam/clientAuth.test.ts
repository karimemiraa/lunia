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
import type { CommsSender } from "@/modules/booking/outbox";

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
    await getRedis().del(`otp:phone:${phone}`, `otpreq:phone:${phone}`, `otpver:phone:${phone}`);
    await prisma.communicationLog.deleteMany({ where: { toPhone: phone } });
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

    const raw = await getRedis().get(`otp:phone:${phone}`);
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw as string) as { code: string };
    expect(record.code).toBe(devCode);
  });

  it("does not persist the OTP code in the CommunicationLog body (redacted)", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const { devCode } = await requestOtp(phone);
    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone, kind: "OTP" } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    for (const log of logs) {
      expect(log.body).not.toContain(devCode as string);
    }
  });

  it("requestOtp with an email identifier delivers on the email channel and stores the code under the email key", async () => {
    const email = `otp-${Date.now()}@example.com`;
    const captured: Array<{ channel: string; toEmail?: string; toPhone?: string; subject?: string }> = [];
    const sender: CommsSender = {
      async send(msg) {
        captured.push(msg);
        return { ok: true, providerRef: "email-otp-ref" };
      },
    };
    try {
      const { devCode } = await requestOtp(email, { sender, locale: "en" });
      expect(devCode).toMatch(/^\d{6}$/);
      expect(captured).toHaveLength(1);
      expect(captured[0]!.channel).toBe("email");
      expect(captured[0]!.toEmail).toBe(email);
      expect(captured[0]!.subject).toBeTruthy();

      const raw = await getRedis().get(`otp:email:${email}`);
      expect(raw).toBeTruthy();

      // The log stores the email recipient with the code redacted.
      const logs = await prisma.communicationLog.findMany({ where: { toEmail: email, kind: "OTP" } });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0]!.channel).toBe("email");
      expect(logs[0]!.body).not.toContain(devCode as string);

      // Verifying creates a CLIENT user identified by email.
      const result = await verifyOtp(email, devCode as string);
      expect(result).not.toBeNull();
      const userId = (result as { userId: string }).userId;
      createdUserIds.push(userId);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.type).toBe("CLIENT");
      expect(user?.email).toBe(email);
      expect(user?.phone).toBeNull();
    } finally {
      await getRedis().del(`otp:email:${email}`, `otpreq:email:${email}`, `otpver:email:${email}`);
      await prisma.communicationLog.deleteMany({ where: { toEmail: email } });
    }
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

    const raw = await getRedis().get(`otp:phone:${phone}`);
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

    const raw = await getRedis().get(`otp:phone:${phone}`);
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

  it("requestOtp writes a SENT CommunicationLog row for the OTP via the (stub) SMS sender in test env, and still returns devCode", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const { devCode } = await requestOtp(phone, { channel: "sms" });
    expect(devCode).toMatch(/^\d{6}$/);

    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone, kind: "OTP" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].channel).toBe("sms");
    expect(logs[0].status).toBe("SENT");
    // The stored audit body is redacted: it records that an OTP was sent but
    // never the code itself (the real code went to the user's phone).
    expect(logs[0].body).not.toContain(devCode as string);
  });

  it("requestOtp sends the code via an injected SMS sender (production-simulated) using the requested locale's template, and logs it SENT", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const sent: { channel: string; toPhone?: string; body: string; kind: string }[] = [];
    const fakeSender: CommsSender = {
      async send(msg) {
        sent.push(msg);
        return { ok: true, providerRef: "fake-ref-1" };
      },
    };

    const { devCode } = await requestOtp(phone, { sender: fakeSender, locale: "en", channel: "sms" });

    expect(sent).toHaveLength(1);
    expect(sent[0].channel).toBe("sms");
    expect(sent[0].kind).toBe("OTP");
    expect(sent[0].toPhone).toBe(phone);
    expect(sent[0].body).toContain(devCode as string);

    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone, kind: "OTP" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("SENT");
    expect(logs[0].providerRef).toBe("fake-ref-1");
  });

  it("a throwing SMS sender does not make requestOtp throw — the code is still stored, retrievable, and a FAILED log is written", async () => {
    const phone = uniquePhone();
    usedPhones.push(phone);

    const throwingSender: CommsSender = {
      async send() {
        throw new Error("provider unreachable");
      },
    };

    const { devCode } = await requestOtp(phone, { sender: throwingSender });
    expect(devCode).toMatch(/^\d{6}$/);

    const raw = await getRedis().get(`otp:phone:${phone}`);
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw as string) as { code: string };
    expect(record.code).toBe(devCode);

    const result = await verifyOtp(phone, devCode as string);
    expect(result).not.toBeNull();
    createdUserIds.push((result as { userId: string }).userId);

    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone, kind: "OTP" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("FAILED");
  });
});
