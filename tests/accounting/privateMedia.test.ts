import { describe, it, expect, afterAll } from "vitest";
import { storage } from "@/lib/storage";
import { GET } from "@/app/api/media/[...path]/route";
import { storeReceipt } from "@/modules/accounting/receipts";

describe("public /api/media never serves finance receipts", () => {
  let key = "";

  afterAll(async () => {
    if (key) await storage.delete(key);
  });

  it("404s a stored receipt, however the path is spelled", async () => {
    key = await storeReceipt(Buffer.from("%PDF-1.4 private"), "application/pdf", "pdf");
    for (const segments of [key.split("/"), [".", ...key.split("/")], ["Finance", ...key.split("/").slice(1)]]) {
      const response = await GET(new Request(`http://localhost/api/media/${segments.join("/")}`), {
        params: Promise.resolve({ path: segments }),
      });
      expect(response.status).toBe(404);
    }
    // The blob is still there for the authenticated receipt route.
    expect(await storage.get(key)).not.toBeNull();
  });
});
