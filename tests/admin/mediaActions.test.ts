import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => ({ value: "session-token" }) })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("unexpected redirect");
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockGetCurrentUser = vi.fn();
vi.mock("@/modules/iam/rbac", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/storage", () => ({
  storage: {
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    get: vi.fn(),
  },
}));

const mockCreateMedia = vi.fn();
vi.mock("@/modules/cms/media", () => ({
  createMedia: (...args: unknown[]) => mockCreateMedia(...args),
  updateMediaAlt: vi.fn(),
  deleteMedia: vi.fn(),
}));

import { PERMISSIONS } from "@/modules/iam/permissions";
import { uploadMedia } from "@/app/admin/media/actions";

const ADMIN_USER = { id: "user-1", permissions: new Set([PERMISSIONS.CMS_MANAGE]) };

function fileFormData(name: string, mimeType: string, bytes = "fake-bytes"): FormData {
  const formData = new FormData();
  formData.set("file", new File([bytes], name, { type: mimeType }));
  return formData;
}

describe("uploadMedia", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset().mockResolvedValue(ADMIN_USER);
    mockPut.mockReset().mockResolvedValue(undefined);
    mockDelete.mockReset().mockResolvedValue(undefined);
    mockCreateMedia.mockReset().mockResolvedValue({ id: "media-1" });
  });

  it("passes the authenticated admin's id as uploadedById", async () => {
    const result = await uploadMedia(null, fileFormData("photo.png", "image/png"));

    expect(result.error).toBeUndefined();
    expect(mockCreateMedia).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedById: "user-1", kind: "IMAGE" }),
    );
  });

  it("rejects image/svg+xml uploads before touching storage or the database", async () => {
    const result = await uploadMedia(null, fileFormData("evil.svg", "image/svg+xml"));

    expect(result.error).toBe("Only image or video files are allowed.");
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockCreateMedia).not.toHaveBeenCalled();
  });

  it("still accepts other image and video mime types", async () => {
    const imageResult = await uploadMedia(null, fileFormData("photo.webp", "image/webp"));
    expect(imageResult.error).toBeUndefined();

    const videoResult = await uploadMedia(null, fileFormData("clip.mp4", "video/mp4"));
    expect(videoResult.error).toBeUndefined();
  });
});
