import { describe, it, expect, afterAll } from "vitest";
import { storage } from "@/lib/storage";

const testKey = `test/storage-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;

describe("storage", () => {
  afterAll(async () => {
    await storage.delete(testKey);
  });

  it("stores and retrieves a buffer with its content type", async () => {
    const data = Buffer.from("hello lunia");
    await storage.put(testKey, data, "text/plain");

    const result = await storage.get(testKey);

    expect(result).not.toBeNull();
    expect(result?.data.equals(data)).toBe(true);
    expect(result?.contentType).toBe("text/plain");
  });

  it("returns null after delete", async () => {
    const key = `test/delete-me-${Date.now()}.txt`;
    await storage.put(key, Buffer.from("bye"), "text/plain");

    await storage.delete(key);

    expect(await storage.get(key)).toBeNull();
  });

  it("returns null for a key that was never written", async () => {
    expect(await storage.get(`test/never-existed-${Date.now()}`)).toBeNull();
  });

  it("rejects a key containing a path traversal segment", async () => {
    await expect(
      storage.put("../evil", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow();
  });

  it("rejects a key containing a nested path traversal segment", async () => {
    await expect(
      storage.put("images/../../evil", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow();
  });

  it("rejects a key with a leading slash", async () => {
    await expect(
      storage.put("/etc/passwd", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow();
  });

  it("rejects a key containing a null byte", async () => {
    await expect(
      storage.put("evil\0.txt", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow();
  });
});
