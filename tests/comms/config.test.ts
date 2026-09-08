import { describe, it, expect } from "vitest";
import { getCommsConfig } from "@/modules/comms/config";
import { resolveBookingChannel } from "@/modules/booking/outbox";

describe("getCommsConfig bookingChannel", () => {
  it("parses COMMS_BOOKING_CHANNEL when valid (case-insensitive)", () => {
    expect(getCommsConfig({ COMMS_BOOKING_CHANNEL: "sms" }).bookingChannel).toBe("sms");
    expect(getCommsConfig({ COMMS_BOOKING_CHANNEL: "WhatsApp" }).bookingChannel).toBe("whatsapp");
  });

  it("leaves bookingChannel undefined when unset or invalid", () => {
    expect(getCommsConfig({}).bookingChannel).toBeUndefined();
    expect(getCommsConfig({ COMMS_BOOKING_CHANNEL: "carrier-pigeon" }).bookingChannel).toBeUndefined();
    expect(getCommsConfig({ COMMS_BOOKING_CHANNEL: "" }).bookingChannel).toBeUndefined();
  });
});

describe("resolveBookingChannel", () => {
  const base = { from: undefined, meta: undefined, twilio: undefined, unifonic: undefined, configured: false } as const;

  it("honors an explicit bookingChannel over the provider default", () => {
    expect(resolveBookingChannel({ ...base, provider: "twilio", bookingChannel: "sms" })).toBe("sms");
    expect(resolveBookingChannel({ ...base, provider: "unifonic", bookingChannel: "whatsapp" })).toBe("whatsapp");
  });

  it("falls back to the provider-derived channel when bookingChannel is unset", () => {
    expect(resolveBookingChannel({ ...base, provider: "twilio" })).toBe("whatsapp");
    expect(resolveBookingChannel({ ...base, provider: "meta_whatsapp" })).toBe("whatsapp");
    expect(resolveBookingChannel({ ...base, provider: "unifonic" })).toBe("sms");
    expect(resolveBookingChannel({ ...base, provider: "none" })).toBe("whatsapp");
  });
});
