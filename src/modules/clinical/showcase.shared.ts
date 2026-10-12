// Client-safe gallery vocabulary (no DB imports). The order matches the
// results page's localized `resultsIndex.categories` list (en/ar messages).
export const SHOWCASE_CATEGORIES = [
  { key: "skin", label: "Skin Quality" },
  { key: "hair", label: "Hair & Scalp" },
  { key: "recovery", label: "Post-Surgery Recovery" },
] as const;
export type ShowcaseCategory = (typeof SHOWCASE_CATEGORIES)[number]["key"];
