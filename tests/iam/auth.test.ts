import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/iam/password";

describe("password", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("nope", hash)).toBe(false);
  });
});
