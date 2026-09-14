import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock nodemailer so no real SMTP connection is ever attempted. vi.mock is
// hoisted above imports, so the mock fns must be created via vi.hoisted (not
// plain top-level consts) to be initialized before the factory runs.
const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});
vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

import { makeEmailSender } from "@/modules/comms/providers/email";
import { getEmailSender, resolveSenderForChannel } from "@/modules/comms/sender";
import { getCommsConfig } from "@/modules/comms/config";

const cfg = { host: "smtp.example.com", port: 587, user: "u", pass: "s3cr3t", from: "Lunia <no-reply@lunia.com>" };
const msg = { channel: "email", toEmail: "client@example.com", subject: "Your Lunia code", body: "Code: 123456", kind: "OTP" };

beforeEach(() => {
  sendMailMock.mockReset();
  createTransportMock.mockClear();
});

describe("makeEmailSender", () => {
  it("sends via SMTP and returns {ok:true, providerRef} from messageId", async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: "<abc@smtp>" });
    const sender = makeEmailSender(cfg);
    const result = await sender.send(msg);
    expect(result).toEqual({ ok: true, providerRef: "<abc@smtp>" });
    const call = sendMailMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.to).toBe("client@example.com");
    expect(call.subject).toBe("Your Lunia code");
    expect(call.from).toBe(cfg.from);
    expect(call.text).toBe("Code: 123456");
    // Branded HTML part is sent alongside the plain-text fallback.
    expect(String(call.html)).toContain("LUNIA");
    expect(String(call.html)).toContain("123456");
  });

  it("uses a default subject when none is provided", async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: "<x@smtp>" });
    const sender = makeEmailSender(cfg);
    await sender.send({ ...msg, subject: undefined });
    const call = sendMailMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.subject).toBe("Lunia");
  });

  it("returns {ok:false} when there is no recipient email", async () => {
    const sender = makeEmailSender(cfg);
    const result = await sender.send({ ...msg, toEmail: undefined });
    expect(result).toEqual({ ok: false });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("returns {ok:false} when the transport throws (and never logs the password)", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("connection refused"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const sender = makeEmailSender(cfg);
      const result = await sender.send(msg);
      expect(result).toEqual({ ok: false });
      for (const call of errorSpy.mock.calls) {
        expect(call.join(" ")).not.toContain(cfg.pass);
      }
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns {ok:false} when no messageId comes back", async () => {
    sendMailMock.mockResolvedValueOnce({});
    const sender = makeEmailSender(cfg);
    expect(await sender.send(msg)).toEqual({ ok: false });
  });

  it("uses implicit TLS (secure) only for port 465", async () => {
    const lastConfig = () => (createTransportMock.mock.calls.at(-1) as unknown[])[0];
    makeEmailSender({ ...cfg, port: 465 });
    expect(lastConfig()).toMatchObject({ secure: true });
    makeEmailSender({ ...cfg, port: 587 });
    expect(lastConfig()).toMatchObject({ secure: false });
  });
});

describe("getCommsConfig email", () => {
  it("is emailConfigured only when all SMTP vars are present", () => {
    expect(getCommsConfig({}).emailConfigured).toBe(false);
    const full = getCommsConfig({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "u",
      SMTP_PASS: "p",
      COMMS_EMAIL_FROM: "no-reply@lunia.com",
    });
    expect(full.emailConfigured).toBe(true);
    expect(full.email).toMatchObject({ host: "smtp.example.com", port: 465, from: "no-reply@lunia.com" });
    // Missing pass => not configured.
    expect(
      getCommsConfig({ SMTP_HOST: "h", SMTP_USER: "u", COMMS_EMAIL_FROM: "f" }).emailConfigured,
    ).toBe(false);
  });

  it("defaults the SMTP port to 587 when unset or non-numeric", () => {
    const c = getCommsConfig({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", COMMS_EMAIL_FROM: "f" });
    expect(c.email?.port).toBe(587);
  });
});

describe("getEmailSender / resolveSenderForChannel", () => {
  const fullEnv = {
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "u",
    SMTP_PASS: "p",
    COMMS_EMAIL_FROM: "no-reply@lunia.com",
  };

  it("returns the stub outside production even when configured", async () => {
    sendMailMock.mockResolvedValue({ messageId: "should-not-be-used" });
    const sender = getEmailSender(fullEnv, "development");
    const res = await sender.send(msg);
    expect(res.providerRef).toMatch(/^stub-/);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("returns the real SMTP sender in production when configured", async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: "<real@smtp>" });
    const sender = getEmailSender(fullEnv, "production");
    const res = await sender.send(msg);
    expect(res).toEqual({ ok: true, providerRef: "<real@smtp>" });
  });

  it("routes channels: email->email sender, sms->stub(dev), other->stub(dev)", async () => {
    const emailSender = resolveSenderForChannel("email", fullEnv, "development");
    expect((await emailSender.send(msg)).providerRef).toMatch(/^stub-/); // dev => stub
    const smsSender = resolveSenderForChannel("sms", {}, "development");
    expect((await smsSender.send({ ...msg, channel: "sms", toPhone: "+966500000000" })).providerRef).toMatch(/^stub-/);
  });
});
