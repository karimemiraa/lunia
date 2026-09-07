import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "@/modules/iam/permissions";

const mockGetCookie = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockGetCookie })),
}));

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));

const mockGetCurrentUser = vi.fn();
vi.mock("@/modules/iam/rbac", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

import { requireAdmin, decideAdminAccess } from "@/app/admin/_components/requireAdmin";

describe("decideAdminAccess", () => {
  it("returns 'login' when there is no user", () => {
    expect(decideAdminAccess(null)).toBe("login");
  });

  it("returns 'forbidden' when the user lacks the required permission", () => {
    const user = { id: "u1", permissions: new Set([PERMISSIONS.CMS_MANAGE]) };
    expect(decideAdminAccess(user, PERMISSIONS.SETTINGS_MANAGE)).toBe("forbidden");
  });

  it("returns 'ok' when the user has the required permission", () => {
    const user = { id: "u1", permissions: new Set([PERMISSIONS.SETTINGS_MANAGE]) };
    expect(decideAdminAccess(user, PERMISSIONS.SETTINGS_MANAGE)).toBe("ok");
  });

  it("returns 'ok' when no permission is required", () => {
    const user = { id: "u1", permissions: new Set<(typeof PERMISSIONS)[keyof typeof PERMISSIONS]>() };
    expect(decideAdminAccess(user)).toBe("ok");
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    mockGetCookie.mockReset();
    mockGetCurrentUser.mockReset();
  });

  it("redirects to /admin/login when there is no session cookie", async () => {
    mockGetCookie.mockReturnValue(undefined);
    mockGetCurrentUser.mockResolvedValue(null);

    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("redirects to /admin when the user lacks the required permission", async () => {
    mockGetCookie.mockReturnValue({ value: "tok" });
    mockGetCurrentUser.mockResolvedValue({ id: "u1", permissions: new Set([PERMISSIONS.CMS_MANAGE]) });

    await expect(requireAdmin(PERMISSIONS.SETTINGS_MANAGE)).rejects.toThrow("REDIRECT:/admin");
  });

  it("returns the user when they have the required permission", async () => {
    mockGetCookie.mockReturnValue({ value: "tok" });
    const user = { id: "u1", permissions: new Set([PERMISSIONS.SETTINGS_MANAGE]) };
    mockGetCurrentUser.mockResolvedValue(user);

    await expect(requireAdmin(PERMISSIONS.SETTINGS_MANAGE)).resolves.toEqual(user);
  });

  it("returns the user when no permission is required", async () => {
    mockGetCookie.mockReturnValue({ value: "tok" });
    const user = { id: "u1", permissions: new Set<(typeof PERMISSIONS)[keyof typeof PERMISSIONS]>() };
    mockGetCurrentUser.mockResolvedValue(user);

    await expect(requireAdmin()).resolves.toEqual(user);
  });
});
