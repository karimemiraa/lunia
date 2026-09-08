const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Shared slug validation for catalog write helpers (departments, services,
// brands, journal posts) — mirrors the pattern already used for
// MembershipTier keys in src/modules/iam/tiers.ts.
export function assertValidSlug(slug: string, label = "slug"): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid ${label} "${slug}": must be lowercase letters, digits, and hyphens only`);
  }
}
