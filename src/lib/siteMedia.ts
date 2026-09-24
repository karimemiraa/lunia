// Curated fallback media for the public site (free-license stock in
// public/media — credits in public/media/CREDITS.md). CMS media always wins:
// these only fill slots where nothing has been uploaded yet, so the site
// never shows an empty frame, and uploading in Admin replaces them.

export type SiteMedia =
  | { type: "video"; src: string; poster: string; mobileSrc?: string }
  | { type: "image"; src: string }
  | { type: "cms"; key: string; kind: "IMAGE" | "VIDEO" };

const video = (name: string): SiteMedia => ({ type: "video", src: `/media/${name}.mp4`, poster: `/media/${name}.jpg` });
const image = (file: string): SiteMedia => ({ type: "image", src: `/media/${file}` });

/** A short ambient film per department (department page heroes). */
export const DEPARTMENT_FILM: Record<string, SiteMedia> = {
  skin: video("treat"),
  "hair-scalp": video("hair"),
  "post-surgery": video("recovery"),
};

/** A still per department, used when the CMS has no (or a duplicate) image. */
const DEPARTMENT_STILL: Record<string, SiteMedia> = {
  skin: image("svc-facial.webp"),
  "hair-scalp": image("dept-hair.webp"),
  "post-surgery": image("svc-lounge.webp"),
};

/** A still per service slug. */
const SERVICE_STILL: Record<string, SiteMedia> = {
  "diagnostic-skin-analysis": { type: "image", src: "/media/analyze.jpg" },
  "signature-facials-hydrafacial": image("treatment.webp"),
  "led-light-therapy": image("svc-led.webp"),
  "microdermabrasion-peels": image("svc-facial.webp"),
  "scalp-diagnostic-analysis": image("svc-scalp-analysis.webp"),
  "led-lllt-cap-therapy": image("svc-hair-vitality.webp"),
  "scalp-detox": image("svc-scalp-detox.webp"),
  "scalp-massage-oxygen": image("svc-scalp-massage.webp"),
  "manual-lymphatic-drainage": image("svc-lymphatic.webp"),
  pressotherapy: image("svc-pressotherapy.webp"),
  "compression-garment-guidance": image("svc-compression.webp"),
  "recovery-lounge": image("svc-lounge.webp"),
};

const GENERIC_STILLS: SiteMedia[] = [image("serum-macro.webp"), image("textures.webp"), image("glow.webp"), image("relax.webp")];

export function departmentStill(slug: string): SiteMedia {
  return DEPARTMENT_STILL[slug] ?? GENERIC_STILLS[0]!;
}

export function serviceStill(slug: string, departmentSlug?: string): SiteMedia {
  return SERVICE_STILL[slug] ?? (departmentSlug ? departmentStill(departmentSlug) : GENERIC_STILLS[0]!);
}

/** Journal covers for posts that don't have one yet, chosen per slug so a post keeps the same cover. */
const JOURNAL_STILLS: SiteMedia[] = [image("serum-macro.webp"), { type: "image", src: "/media/analyze.jpg" }, image("relax.webp"), image("textures.webp"), image("glow.webp"), image("svc-hair-vitality.webp")];
const JOURNAL_BY_SLUG: Record<string, SiteMedia> = {
  "the-korean-philosophy-of-skin-quality": image("serum-macro.webp"),
  "understanding-your-skin-analysis": { type: "image", src: "/media/analyze.jpg" },
  "caring-for-your-skin-after-surgery": image("relax.webp"),
};
export function journalStill(slug: string, index: number): SiteMedia {
  return JOURNAL_BY_SLUG[slug] ?? JOURNAL_STILLS[index % JOURNAL_STILLS.length]!;
}

/**
 * CMS media for a list of items, with a fallback wherever an item has none —
 * or re-uses an asset an earlier item already shows (e.g. two departments
 * pointing at the same upload), so a row of cards never repeats a photo.
 */
export function withFallbacks(
  cms: ({ key: string; kind: "IMAGE" | "VIDEO" } | null | undefined)[],
  fallback: (index: number) => SiteMedia,
): SiteMedia[] {
  const seen = new Set<string>();
  return cms.map((m, i) => {
    if (m && !seen.has(m.key)) {
      seen.add(m.key);
      return { type: "cms", key: m.key, kind: m.kind };
    }
    return fallback(i);
  });
}

/** Whole-riyal SAR price from minor units (halalas), localized digits/symbol. */
export function formatSar(locale: string, minor: number): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
