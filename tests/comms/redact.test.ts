import { describe, it, expect } from "vitest";
import { redactOtpBody } from "@/modules/comms/redact";

describe("redactOtpBody", () => {
  it("masks the code wherever it appears", () => {
    const out = redactOtpBody("Your Lunia code is 482913. Valid 5 min.", "482913");
    expect(out).not.toContain("482913");
    expect(out).toContain("Lunia");
  });

  it("masks every occurrence of the code", () => {
    const out = redactOtpBody("123 then 123 again", "123");
    expect(out).not.toContain("123");
  });

  it("is a no-op when the code is empty", () => {
    expect(redactOtpBody("hello", "")).toBe("hello");
  });
});
