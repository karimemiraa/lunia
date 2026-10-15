import type { T } from "../_i18n/t";

// Catalog module errors carry the offending slug/id in the message, so they
// can't be dictionary keys as-is. Each known shape maps to a template key
// that reproduces the English message exactly, so English stays unchanged.
const PATTERNS: Array<[RegExp, string, string[]]> = [
  [/^Invalid slug "(.*)": must be lowercase letters, digits, and hyphens only$/, 'Invalid slug "{slug}": must be lowercase letters, digits, and hyphens only', ["slug"]],
  [/^Department with slug "(.*)" already exists$/, 'Department with slug "{slug}" already exists', ["slug"]],
  [/^Service with slug "(.*)" already exists$/, 'Service with slug "{slug}" already exists', ["slug"]],
  [/^Brand with slug "(.*)" already exists$/, 'Brand with slug "{slug}" already exists', ["slug"]],
  [/^Post with slug "(.*)" already exists$/, 'Post with slug "{slug}" already exists', ["slug"]],
  [/^Department "(.*)" not found$/, 'Department "{id}" not found', ["id"]],
  [/^Service "(.*)" not found$/, 'Service "{id}" not found', ["id"]],
  [/^Brand "(.*)" not found$/, 'Brand "{id}" not found', ["id"]],
  [/^Post "(.*)" not found$/, 'Post "{id}" not found', ["id"]],
  [/^Membership tier "(.*)" not found$/, 'Membership tier "{id}" not found', ["id"]],
];

/** Translates an error message thrown by src/modules/catalog (and booking service settings). */
export function catalogErrorMessage(message: string, t: T): string {
  for (const [re, key, names] of PATTERNS) {
    const m = re.exec(message);
    if (m) return t(key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return t(message);
}
