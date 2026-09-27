import { describe, it, expect, afterAll } from "vitest";
import { storage, isPrivateStorageKey } from "@/lib/storage";
import { getRedis } from "@/lib/redis";
import { createSession, destroySession } from "@/modules/iam/session";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { uploadClinicalPhoto } from "@/modules/clinical/photos";
import { GET as getPhoto } from "@/app/admin/clinical/photo/[id]/route";
import { GET as getMedia } from "@/app/api/media/[...path]/route";
import { cleanupUsers, makeClient, makeStaff, TINY_PNG } from "./helpers";

const users: string[] = [];
const roles: string[] = [];
const tokens: string[] = [];
const keys: string[] = [];

afterAll(async () => {
  for (const t of tokens) await destroySession(t);
  for (const k of keys) await storage.delete(k);
  await cleanupUsers(users, roles);
  getRedis().disconnect();
});

async function staffToken(perms: Parameters<typeof makeStaff>[0]) {
  const s = await makeStaff(perms);
  users.push(s.userId);
  roles.push(s.roleId);
  const token = await createSession(s.userId);
  tokens.push(token);
  return token;
}

const req = (id: string, token?: string) =>
  getPhoto(new Request(`http://localhost/admin/clinical/photo/${id}`, { headers: token ? { cookie: `lunia_session=${token}` } : {} }), {
    params: Promise.resolve({ id }),
  });

describe("clinical photos are private", () => {
  it("serves photos only to staff with clinical:manage, and never through /api/media", async () => {
    const c = await makeClient();
    users.push(c.userId);
    const uploader = await makeStaff([PERMISSIONS.CLINICAL_MANAGE]);
    users.push(uploader.userId);
    roles.push(uploader.roleId);

    const photo = await uploadClinicalPhoto({ clientProfileId: c.clientProfileId, kind: "BEFORE", uploadedById: uploader.userId }, TINY_PNG);
    keys.push(photo.storageKey);
    expect(photo.storageKey.startsWith(`clinical/${c.clientProfileId}/`)).toBe(true);
    expect(photo.mime).toBe("image/png");

    expect((await req(photo.id)).status).toBe(401);
    expect((await req(photo.id, await staffToken([PERMISSIONS.CLIENT_VIEW]))).status).toBe(403);

    const ok = await req(photo.id, await staffToken([PERMISSIONS.CLINICAL_MANAGE]));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Buffer.from(await ok.arrayBuffer()).equals(TINY_PNG)).toBe(true);

    // A client session token must not work either (getCurrentUser is staff-only).
    const clientToken = await createSession(c.userId);
    tokens.push(clientToken);
    expect((await req(photo.id, clientToken)).status).toBe(401);

    // The public media route refuses the key and its spelling variants.
    for (const segments of [photo.storageKey.split("/"), [".", ...photo.storageKey.split("/")], ["", ...photo.storageKey.split("/")]]) {
      const res = await getMedia(new Request("http://localhost/api/media/x"), { params: Promise.resolve({ path: segments }) });
      expect(res.status).toBe(404);
    }
  });

  it("rejects files that are not images regardless of the claimed type", async () => {
    const c = await makeClient();
    users.push(c.userId);
    await expect(
      uploadClinicalPhoto({ clientProfileId: c.clientProfileId, uploadedById: "x" }, Buffer.from("<svg onload=alert(1)>")),
    ).rejects.toThrow(/Only JPG/);
  });
});

describe("isPrivateStorageKey", () => {
  it("matches clinical/ and finance/ however the key is spelled", () => {
    for (const k of ["clinical/a.png", "./clinical/a.png", "/clinical/a.png", "Clinical/a.png", "clinical//a.png", "finance/r.pdf", "FINANCE/r.pdf", "media/../clinical/a.png"]) {
      expect(isPrivateStorageKey(k), k).toBe(true);
    }
    for (const k of ["media/a.png", "clinicalx/a.png", "test/clinical/a.png"]) {
      expect(isPrivateStorageKey(k), k).toBe(false);
    }
  });
});
