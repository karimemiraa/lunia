import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { uploadClinicalPhoto, deleteClinicalPhoto } from "@/modules/clinical/photos";
import { createShowcase, setPhotoShareConsent, setShowcasePublished, listPublishedShowcases, getPublicShowcasePhoto } from "@/modules/clinical/showcase";
import { GET as publicPhoto } from "@/app/api/results/[id]/[side]/route";
import { makeClient, makeStaff, cleanupUsers, TINY_PNG } from "./helpers";

// The public before/after gallery must never leak a photo without consent:
// consent on both photos + a published pair, re-checked on every request.

const users: string[] = [];
const roles: string[] = [];
let staffId = "";

beforeAll(async () => {
  const staff = await makeStaff(["clinical:manage"]);
  staffId = staff.userId;
  users.push(staff.userId);
  roles.push(staff.roleId);
});

afterAll(async () => {
  await cleanupUsers(users, roles);
});

async function pair(name: string) {
  const c = await makeClient(name);
  users.push(c.userId);
  const before = await uploadClinicalPhoto({ clientProfileId: c.clientProfileId, kind: "BEFORE", uploadedById: staffId }, TINY_PNG);
  const after = await uploadClinicalPhoto({ clientProfileId: c.clientProfileId, kind: "AFTER", uploadedById: staffId }, TINY_PNG);
  return { c, before, after };
}

const fetchPublic = (id: string, side: string) => publicPhoto(new Request(`http://x/api/results/${id}/${side}`), { params: Promise.resolve({ id, side }) });

describe("results gallery", () => {
  it("refuses pairs without consent, mixed customers or wrong labels", async () => {
    const { before, after } = await pair("Gallery A");
    await expect(createShowcase({ beforePhotoId: before.id, afterPhotoId: after.id, category: "skin" }, staffId)).rejects.toThrow(/consent/);

    await setPhotoShareConsent(before.id, true);
    await setPhotoShareConsent(after.id, true);
    await expect(createShowcase({ beforePhotoId: after.id, afterPhotoId: before.id, category: "skin" }, staffId)).rejects.toThrow(/Before.*After/);

    const other = await pair("Gallery Other");
    await setPhotoShareConsent(other.after.id, true);
    await expect(createShowcase({ beforePhotoId: before.id, afterPhotoId: other.after.id, category: "skin" }, staffId)).rejects.toThrow(/same customer/);
  });

  it("serves a pair publicly only while published and consented; withdrawing consent unpublishes it", async () => {
    const { before, after } = await pair("Gallery B");
    await setPhotoShareConsent(before.id, true);
    await setPhotoShareConsent(after.id, true);
    const sc = await createShowcase({ beforePhotoId: before.id, afterPhotoId: after.id, category: "hair", captionEn: "3 sessions" }, staffId);

    // Draft: not public.
    expect((await listPublishedShowcases()).map((s) => s.id)).not.toContain(sc.id);
    expect((await fetchPublic(sc.id, "before")).status).toBe(404);

    await setShowcasePublished(sc.id, true);
    const published = (await listPublishedShowcases()).find((s) => s.id === sc.id);
    // Only safe fields reach the public site.
    expect(published).toEqual({ id: sc.id, category: "hair", captionEn: "3 sessions", captionAr: "" });
    const res = await fetchPublic(sc.id, "after");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/public/);
    expect((await fetchPublic(sc.id, "sideways")).status).toBe(404);

    // Customer withdraws consent on one photo → pair unpublished, image gone.
    const { unpublished } = await setPhotoShareConsent(before.id, false);
    expect(unpublished).toBe(1);
    expect(await getPublicShowcasePhoto(sc.id, "after")).toBeNull();
    expect((await fetchPublic(sc.id, "after")).status).toBe(404);
    // …and it can't be republished until consent is recorded again.
    await expect(setShowcasePublished(sc.id, true)).rejects.toThrow(/consent/);
  });

  it("deleting a photo removes its pairs", async () => {
    const { before, after } = await pair("Gallery C");
    await setPhotoShareConsent(before.id, true);
    await setPhotoShareConsent(after.id, true);
    const sc = await createShowcase({ beforePhotoId: before.id, afterPhotoId: after.id, category: "recovery", publish: true }, staffId);
    expect((await fetchPublic(sc.id, "before")).status).toBe(200);
    await deleteClinicalPhoto(after.id);
    expect(await prisma.resultShowcase.findUnique({ where: { id: sc.id } })).toBeNull();
    expect((await fetchPublic(sc.id, "before")).status).toBe(404);
  });
});
