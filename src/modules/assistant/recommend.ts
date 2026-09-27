// Maps a consultation profile to 1-3 real services from the catalog. Nothing
// here hardcodes ids: each concern lists keywords that are matched against
// service slugs and English names in priority order, so renaming or adding a
// service keeps working. When the picture is unclear (no concern, many
// concerns, treatments already tried) the department's diagnostic analysis
// leads the list; safety flags reduce the list to that consultation only.

import type { Concern, ConsultProfile, Contraindication } from "./types";

export interface CatalogService {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  summaryEn: string;
  summaryAr: string;
  departmentSlug: string;
  durationMin: number;
  priceMinor: number;
  onlineBookable: boolean;
  inCenterOnly: boolean;
  /** Name of the minimum membership tier, when the service is gated. */
  tierName: string | null;
}

export type Domain = "skin" | "hair" | "post_surgery";

export function domainOf(concern: Concern): Domain {
  if (concern === "hair_loss" || concern === "dandruff" || concern === "hair_damage") return "hair";
  if (concern === "post_surgery") return "post_surgery";
  return "skin";
}

// Keywords matched against `${slug} ${nameEn}` (lowercased), best first.
export const CONCERN_SERVICE_KEYWORDS: Record<Concern, string[]> = {
  acne: ["peel", "microderm", "hydrafacial", "led-light", "led light"],
  scars: ["microderm", "peel", "led-light"],
  pigmentation: ["peel", "microderm", "led-light", "hydrafacial"],
  dullness: ["hydrafacial", "facial", "peel", "led-light"],
  dryness: ["hydrafacial", "facial", "led-light"],
  sensitivity: ["led-light", "led light", "facial"],
  aging: ["led-light", "led light", "microderm", "hydrafacial"],
  pores: ["hydrafacial", "microderm", "peel"],
  oiliness: ["hydrafacial", "peel", "led-light"],
  dark_circles: ["led-light", "hydrafacial"],
  hair_loss: ["lllt", "cap", "scalp-massage", "oxygen", "scalp-detox"],
  dandruff: ["scalp-detox", "detox", "scalp-massage", "oxygen"],
  hair_damage: ["scalp-massage", "oxygen", "scalp-detox"],
  post_surgery: ["lymphatic", "pressotherapy", "compression", "recovery"],
};

const DIAGNOSTIC_KEYWORDS: Record<Domain, string[]> = {
  skin: ["diagnostic-skin", "skin-analysis", "skin analysis"],
  hair: ["scalp-diagnostic", "scalp-analysis", "scalp analysis", "hair-analysis"],
  post_surgery: ["consultation", "assessment"],
};

const DEPARTMENT_HINT: Record<Domain, string[]> = {
  skin: ["skin"],
  hair: ["hair", "scalp"],
  post_surgery: ["surgery", "recovery"],
};

// Safety flags that turn the recommendation into "consultation first".
export const CAREFUL_FLAGS: Contraindication[] = ["pregnant", "breastfeeding", "infection", "recent_procedure"];

export function needsCareful(profile: Pick<ConsultProfile, "contraindications" | "concerns">): boolean {
  return profile.contraindications.some((c) => {
    // For someone recovering from surgery the recent procedure is the reason
    // they're here, not a red flag against post-surgery care.
    if (c === "recent_procedure" && profile.concerns.includes("post_surgery")) return false;
    return CAREFUL_FLAGS.includes(c);
  });
}

const haystack = (s: CatalogService) => `${s.slug} ${s.nameEn}`.toLowerCase();

function findByKeyword(catalog: CatalogService[], keyword: string, domain?: Domain): CatalogService | undefined {
  const inDomain = domain ? catalog.filter((s) => DEPARTMENT_HINT[domain].some((h) => s.departmentSlug.includes(h))) : catalog;
  return inDomain.find((s) => haystack(s).includes(keyword)) ?? (domain ? undefined : catalog.find((s) => haystack(s).includes(keyword)));
}

export function findDiagnostic(catalog: CatalogService[], domain: Domain, strict = false): CatalogService | undefined {
  for (const keyword of DIAGNOSTIC_KEYWORDS[domain]) {
    const hit = findByKeyword(catalog, keyword, domain);
    if (hit) return hit;
  }
  // Fallback: the first service of the department (e.g. post-surgery has no
  // "diagnostic" but its first service is the natural starting point). Not
  // in strict mode, where only a true consultation/analysis will do.
  if (strict) return undefined;
  return catalog.find((s) => DEPARTMENT_HINT[domain].some((h) => s.departmentSlug.includes(h)));
}

export interface Recommendation {
  service: CatalogService;
  /** The concern this service was picked for, or null for a diagnostic. */
  concern: Concern | null;
  diagnostic: boolean;
}

export interface RecommendResult {
  items: Recommendation[];
  /** True when a safety flag means: consultation / call-back, no treatments. */
  careful: boolean;
  /** True when the profile was too thin to be specific. */
  unsure: boolean;
}

export function recommendServices(profile: ConsultProfile, catalog: CatalogService[]): RecommendResult {
  const concerns = profile.concerns;
  const primaryDomain: Domain = concerns[0] ? domainOf(concerns[0]) : profile.areas.includes("scalp") && !profile.areas.includes("face") ? "hair" : "skin";
  const careful = needsCareful(profile);

  if (careful) {
    const diag = findDiagnostic(catalog, primaryDomain, true);
    return { items: diag ? [{ service: diag, concern: null, diagnostic: true }] : [], careful, unsure: concerns.length === 0 };
  }

  if (concerns.length === 0) {
    // Unsure: offer the diagnostic(s) for the area(s) mentioned, skin first.
    const domains: Domain[] = profile.areas.includes("scalp") ? (profile.areas.includes("face") ? ["skin", "hair"] : ["hair"]) : ["skin"];
    const items = domains
      .map((d) => findDiagnostic(catalog, d))
      .filter((s): s is CatalogService => !!s)
      .map((service) => ({ service, concern: null, diagnostic: true }));
    return { items, careful, unsure: true };
  }

  // Score services: earlier keywords and the first-mentioned concern weigh more.
  const scores = new Map<string, { score: number; concern: Concern; service: CatalogService }>();
  concerns.forEach((concern, ci) => {
    const domain = domainOf(concern);
    const weight = ci === 0 ? 1.5 : 1;
    const seen = new Set<string>();
    CONCERN_SERVICE_KEYWORDS[concern].forEach((keyword, ki) => {
      const service = findByKeyword(catalog, keyword, domain);
      if (!service || seen.has(service.id)) return;
      seen.add(service.id);
      const add = (4 - Math.min(ki, 3)) * weight;
      const prev = scores.get(service.id);
      if (prev) prev.score += add;
      else scores.set(service.id, { score: add, concern, service });
    });
  });

  const diagIds = new Set(
    (["skin", "hair"] as Domain[]).map((d) => findDiagnostic(catalog, d, true)?.id).filter((id): id is string => !!id),
  );
  const ranked = [...scores.values()].filter((r) => !diagIds.has(r.service.id)).sort((a, b) => b.score - a.score);

  // Mixed domains (e.g. skin + hair): best of each rather than two of one.
  const domains = [...new Set(concerns.map(domainOf))];
  let treatments: typeof ranked;
  if (domains.length > 1) {
    treatments = domains
      .map((d) => ranked.find((r) => domainOf(r.concern) === d))
      .filter((r): r is (typeof ranked)[number] => !!r)
      .slice(0, 2);
  } else {
    treatments = ranked.slice(0, primaryDomain === "post_surgery" ? 3 : 2);
  }

  const unsure = concerns.length >= 3 || profile.previousTreatments.length >= 2 || (profile.durationMonths ?? 0) >= 24;
  const items: Recommendation[] = treatments.map((r) => ({ service: r.service, concern: r.concern, diagnostic: false }));
  if (primaryDomain !== "post_surgery") {
    const diag = findDiagnostic(catalog, primaryDomain);
    if (diag) {
      const entry = { service: diag, concern: null, diagnostic: true };
      if (unsure) items.unshift(entry);
      else items.push(entry);
    }
  }
  if (items.length === 0) {
    const diag = findDiagnostic(catalog, primaryDomain);
    if (diag) items.push({ service: diag, concern: null, diagnostic: true });
  }
  return { items: items.slice(0, 3), careful, unsure };
}

/** Whether the public (online) flow may book this service. */
export function isOnlineBookable(service: Pick<CatalogService, "onlineBookable" | "inCenterOnly">): boolean {
  return service.onlineBookable && !service.inCenterOnly;
}
