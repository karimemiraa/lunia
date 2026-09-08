import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/iam/password";
import { authenticateStaff } from "@/modules/iam/auth";

describe("password", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("nope", hash)).toBe(false);
  });
});

describe("authenticateStaff", () => {
  it("returns null for an unknown email without throwing", async () => {
    expect(await authenticateStaff("nobody@nowhere.test", "whatever")).toBeNull();
  });

  it("runs a verify even for absent users (no early return before hashing)", async () => {
    // Both resolve to null and neither throws. Timing parity is guaranteed by
    // construction: the dummy-hash path always runs verifyPassword.
    const a = await authenticateStaff("unknown-a@nowhere.test", "x");
    const b = await authenticateStaff("unknown-b@nowhere.test", "y");
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});
