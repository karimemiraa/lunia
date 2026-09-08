import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { renderTemplate, listTemplates, getTemplate, upsertTemplate } from "@/modules/comms/templates";

// getTemplate() doesn't validate its `kind` argument (only upsertTemplate
// enforces the kind/locale/channel enums), so a random non-enum kind is a
// safe, collision-free way to assert "no row exists" without touching any
// real (seeded or test-created) data.
const KIND_PREFIX = `TEST_KIND_${Date.now()}`;
let kindCounter = 0;
function freshKind(): string {
  kindCounter += 1;
  return `${KIND_PREFIX}_${kindCounter}`;
}

// upsertTemplate enforces kind/locale/channel enums, so test-created rows
// can't use an arbitrary throwaway kind — they have to live at a real
// (kind, locale, channel) unique key. CONFIRMATION/en/sms is never seeded
// (the seed only populates CONFIRMATION on the whatsapp channel), so it's a
// safe slot for round-trip create/update tests without disturbing the real
// seeded default.
const FREE_SLOT = { kind: "CONFIRMATION", locale: "en", channel: "sms" } as const;

afterEach(async () => {
  await prisma.messageTemplate.deleteMany({ where: { kind: { startsWith: KIND_PREFIX } } });
  await prisma.messageTemplate.deleteMany({ where: FREE_SLOT });
});

describe("renderTemplate", () => {
  it("interpolates {{serviceName}} and {{dateTime}} into a seeded CONFIRMATION template", async () => {
    const { body } = await renderTemplate("CONFIRMATION", "en", "whatsapp", {
      serviceName: "HydraFacial",
      dateTime: "Sep 10, 5:00 PM",
    });
    expect(body).toContain("HydraFacial");
    expect(body).toContain("Sep 10, 5:00 PM");
    expect(body).not.toContain("{{");
  });

  it("replaces a missing/unknown placeholder with an empty string rather than leaving it raw", async () => {
    // Omit dateTime entirely, and pass an extra param the template doesn't
    // reference at all — neither should ever surface as raw {{...}} text.
    const { body } = await renderTemplate("CONFIRMATION", "en", "whatsapp", {
      serviceName: "HydraFacial",
      unusedParam: "should be ignored",
    });
    expect(body).toContain("HydraFacial");
    expect(body).not.toContain("{{");
    expect(body).not.toContain("dateTime");
    expect(body).not.toContain("undefined");
  });

  it("falls back sensibly (e.g. to en, or to the built-in default) when no exact (kind,locale,channel) row exists", async () => {
    // No template is ever seeded for a locale of "fr", so this must fall
    // back (through en, or the built-in default) rather than returning
    // empty/throwing.
    const { body } = await renderTemplate("CONFIRMATION", "fr", "whatsapp", {
      serviceName: "Facial",
      dateTime: "tomorrow",
    });
    expect(typeof body).toBe("string");
    expect(body.length).toBeGreaterThan(0);
  });

  it("falls back across channel (whatsapp<->sms) when the exact channel has no row", async () => {
    // CONFIRMATION/en is only ever seeded on the whatsapp channel — asking
    // for the sms channel (no row) must fall back to the whatsapp template's
    // content rather than the built-in default.
    const { body } = await renderTemplate("CONFIRMATION", "en", "sms", {
      serviceName: "HydraFacial",
      dateTime: "Sep 10, 5:00 PM",
    });
    expect(body).toContain("HydraFacial");
    expect(body).toContain("Sep 10, 5:00 PM");
    expect(body).not.toContain("{{");
  });

  it("renders the seeded OTP template with {{code}}", async () => {
    const { body } = await renderTemplate("OTP", "en", "sms", { code: "482913" });
    expect(body).toContain("482913");
    expect(body).not.toContain("{{");
  });

  it("renders the seeded Arabic OTP template with {{code}}", async () => {
    const { body } = await renderTemplate("OTP", "ar", "sms", { code: "482913" });
    expect(body).toContain("482913");
    expect(body).not.toContain("{{");
  });
});

describe("listTemplates / getTemplate", () => {
  it("lists templates including the seeded defaults", async () => {
    const all = await listTemplates();
    expect(all.length).toBeGreaterThan(0);
    const confirmation = all.find((t) => t.kind === "CONFIRMATION" && t.locale === "en" && t.channel === "whatsapp");
    expect(confirmation).toBeDefined();
  });

  it("gets a single template by (kind, locale, channel)", async () => {
    const tpl = await getTemplate("CONFIRMATION", "en", "whatsapp");
    expect(tpl).not.toBeNull();
    expect(tpl?.kind).toBe("CONFIRMATION");
  });

  it("returns null for a (kind,locale,channel) with no row", async () => {
    const tpl = await getTemplate(freshKind(), "en", "whatsapp");
    expect(tpl).toBeNull();
  });
});

describe("upsertTemplate", () => {
  it("creates a new template, then updates it by the same (kind,locale,channel) unique key", async () => {
    const created = await upsertTemplate({
      ...FREE_SLOT,
      bodyTemplate: "Version 1 {{x}}",
    });
    expect(created.bodyTemplate).toBe("Version 1 {{x}}");

    const updated = await upsertTemplate({
      ...FREE_SLOT,
      bodyTemplate: "Version 2 {{x}}",
      providerTemplateName: "prov_name",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.bodyTemplate).toBe("Version 2 {{x}}");
    expect(updated.providerTemplateName).toBe("prov_name");

    const all = await prisma.messageTemplate.findMany({ where: FREE_SLOT });
    expect(all.length).toBe(1);
  });

  it("rejects an invalid kind", async () => {
    await expect(
      upsertTemplate({ kind: "NOT_A_REAL_KIND", locale: "en", channel: "whatsapp", bodyTemplate: "x" }),
    ).rejects.toThrow();
  });

  it("rejects an invalid locale", async () => {
    await expect(
      upsertTemplate({ kind: "CONFIRMATION", locale: "fr", channel: "sms", bodyTemplate: "x" }),
    ).rejects.toThrow();
  });

  it("rejects an invalid channel", async () => {
    await expect(
      upsertTemplate({ kind: "CONFIRMATION", locale: "en", channel: "email", bodyTemplate: "x" }),
    ).rejects.toThrow();
  });

  it("rejects an empty body", async () => {
    await expect(upsertTemplate({ ...FREE_SLOT, bodyTemplate: "" })).rejects.toThrow();
  });
});
