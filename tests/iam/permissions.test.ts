import { describe, it, expect } from "vitest";
import { PERMISSIONS, ALL_PERMISSION_KEYS } from "@/modules/iam/permissions";

describe("permissions catalog", () => {
  it("defines booking and settings permissions", () => {
    expect(PERMISSIONS.BOOKING_MANAGE).toBe("booking:manage");
    expect(PERMISSIONS.SETTINGS_MANAGE).toBe("settings:manage");
  });
  it("exposes a unique list of keys", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });
});
