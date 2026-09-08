// Unit tests for the real WhatsApp/SMS provider adapters (Task 3). global.fetch
// is stubbed for every test in this file so NO real network call is ever made
// — we only assert on the request the adapter builds and how it maps a
// canned response back to CommsSender's {ok, providerRef} shape.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeMetaSender } from "@/modules/comms/providers/meta";
import { makeTwilioSender } from "@/modules/comms/providers/twilio";
import { makeUnifonicSender } from "@/modules/comms/providers/unifonic";
import { makeSender } from "@/modules/comms/providers";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const sampleMsg = {
  channel: "whatsapp",
  toPhone: "+1 555 123 4567",
  body: "Your Lunia booking is confirmed.",
  kind: "CONFIRMATION",
  bookingId: "booking-1",
};

describe("makeMetaSender", () => {
  const cfg = { token: "meta-secret-token", phoneId: "phone-456" };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the Graph API URL with Bearer auth and a whatsapp text body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.X" }] }));

    const sender = makeMetaSender(cfg);
    await sender.send(sampleMsg);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(String(url)).toContain("graph.facebook.com");
    expect(String(url)).toContain("phone-456");
    expect(String(url)).toContain("/messages");
    expect(init?.method).toBe("POST");

    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer meta-secret-token");
    expect(headers.get("Content-Type")).toBe("application/json");

    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("+15551234567");
    expect(body.type).toBe("text");
    expect((body.text as { body: string }).body).toBe(sampleMsg.body);
  });

  it("returns {ok:true, providerRef} for a 200 response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.X" }] }));
    const sender = makeMetaSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: true, providerRef: "wamid.X" });
  });

  it("returns {ok:false} for a 400 response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: { message: "bad request" } }));
    const sender = makeMetaSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: false });
  });

  it("returns {ok:false} when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const sender = makeMetaSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: false });
  });

  it("never logs the token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.X" }] }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const sender = makeMetaSender(cfg);
      await sender.send(sampleMsg);
      for (const spy of [logSpy, infoSpy, errorSpy]) {
        for (const call of spy.mock.calls) {
          expect(call.join(" ")).not.toContain(cfg.token);
        }
      }
    } finally {
      logSpy.mockRestore();
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe("makeTwilioSender", () => {
  const cfg = { accountSid: "AC123", authToken: "twilio-secret", from: "+15550009999" };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the Twilio Messages API with Basic auth and urlencoded From/To/Body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { sid: "SM123" }));

    const sender = makeTwilioSender(cfg);
    await sender.send(sampleMsg);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(String(url)).toBe(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`);
    expect(init?.method).toBe("POST");

    const headers = new Headers(init?.headers);
    const expectedAuth = `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`;
    expect(headers.get("Authorization")).toBe(expectedAuth);
    expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(init?.body as string);
    expect(params.get("From")).toBe("whatsapp:+15550009999");
    expect(params.get("To")).toBe("whatsapp:+15551234567");
    expect(params.get("Body")).toBe(sampleMsg.body);
  });

  it("does not add the whatsapp: prefix for a non-whatsapp channel", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { sid: "SM123" }));
    const sender = makeTwilioSender(cfg);
    await sender.send({ ...sampleMsg, channel: "sms" });

    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    const params = new URLSearchParams(init?.body as string);
    expect(params.get("From")).toBe("+15550009999");
    expect(params.get("To")).toBe("+15551234567");
  });

  it("returns {ok:true, providerRef} for a 201 response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { sid: "SM123" }));
    const sender = makeTwilioSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: true, providerRef: "SM123" });
  });

  it("returns {ok:false} for an error response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: "invalid number" }));
    const sender = makeTwilioSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: false });
  });

  it("returns {ok:false} when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const sender = makeTwilioSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: false });
  });

  it("never logs the auth token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { sid: "SM123" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const sender = makeTwilioSender(cfg);
      await sender.send(sampleMsg);
      for (const call of errorSpy.mock.calls) {
        expect(call.join(" ")).not.toContain(cfg.authToken);
      }
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("makeUnifonicSender", () => {
  const cfg = { appSid: "unifonic-app-sid", senderId: "Lunia" };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the Unifonic REST endpoint with form-encoded AppSid/SenderID/Body/Recipient", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: { MessageID: "uf-1" } }));

    const sender = makeUnifonicSender(cfg);
    await sender.send(sampleMsg);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as FetchArgs;
    expect(String(url)).toContain("unifonic.com");
    expect(String(url)).toContain("/SMS/messages");
    expect(init?.method).toBe("POST");

    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(init?.body as string);
    expect(params.get("AppSid")).toBe(cfg.appSid);
    expect(params.get("SenderID")).toBe(cfg.senderId);
    expect(params.get("Body")).toBe(sampleMsg.body);
    expect(params.get("Recipient")).toBe("15551234567");
  });

  it("returns {ok:true} with providerRef from MessageID for a 200 response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: { MessageID: "uf-1" } }));
    const sender = makeUnifonicSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result.ok).toBe(true);
    expect(result.providerRef).toBe("uf-1");
  });

  it("returns {ok:false} when a 200 response carries no MessageID (never synthesizes a ref)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));
    const sender = makeUnifonicSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: false });
  });

  // Unifonic returns HTTP 200 even for logical failures (invalid recipient,
  // insufficient balance) with success:"false" -- these must NOT be recorded
  // as SENT. Covers both the string form Unifonic actually sends and a boolean.
  it('returns {ok:false} for a HTTP 200 with success:"false" (logical failure)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: "false", errorCode: "EC:0007", message: "Invalid recipient" }),
    );
    const sender = makeUnifonicSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: false });
  });

  it("returns {ok:false} for a HTTP 200 with success:false and a MessageID present", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: false, data: { MessageID: "uf-x" } }));
    const sender = makeUnifonicSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: false });
  });

  it('accepts the string form success:"true" with a MessageID', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: "true", data: { MessageID: "uf-2" } }));
    const sender = makeUnifonicSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: true, providerRef: "uf-2" });
  });

  it("returns {ok:false} for an error response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { success: false, message: "unauthorized" }));
    const sender = makeUnifonicSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: false });
  });

  it("returns {ok:false} when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const sender = makeUnifonicSender(cfg);
    const result = await sender.send(sampleMsg);
    expect(result).toEqual({ ok: false });
  });
});

describe("makeSender dispatch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { messages: [{ id: "wamid.X" }], sid: "SM1", data: {} }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches to the Meta adapter for provider meta_whatsapp", async () => {
    const sender = makeSender({
      provider: "meta_whatsapp",
      meta: { token: "t", phoneId: "phone-456" },
      configured: true,
    });
    await sender.send(sampleMsg);
    const [url] = fetchMock.mock.calls[0] as FetchArgs;
    expect(String(url)).toContain("graph.facebook.com");
  });

  it("dispatches to the Twilio adapter for provider twilio", async () => {
    const sender = makeSender({
      provider: "twilio",
      twilio: { accountSid: "AC1", authToken: "tok", from: "+15550009999" },
      configured: true,
    });
    await sender.send(sampleMsg);
    const [url] = fetchMock.mock.calls[0] as FetchArgs;
    expect(String(url)).toContain("api.twilio.com");
  });

  it("dispatches to the Unifonic adapter for provider unifonic", async () => {
    const sender = makeSender({
      provider: "unifonic",
      unifonic: { appSid: "app-1", senderId: "Lunia" },
      configured: true,
    });
    await sender.send(sampleMsg);
    const [url] = fetchMock.mock.calls[0] as FetchArgs;
    expect(String(url)).toContain("unifonic.com");
  });

  it("returns stubSender (no fetch call) for provider none", async () => {
    const sender = makeSender({ provider: "none", configured: false });
    await sender.send(sampleMsg);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
