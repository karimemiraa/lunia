// Translates error messages from src/modules (hr, iam) for display. Most are
// fixed sentences (looked up as-is); a few embed a value, so they are matched
// here and re-built from a translated template with the value as a placeholder.
import type { T } from "../../_i18n/t";

const PATTERNS: { re: RegExp; key: string; vars: (m: RegExpMatchArray, t: T) => Record<string, string> }[] = [
  { re: /^A payroll run for (\S+) already exists\.$/, key: "A payroll run for {month} already exists.", vars: (m) => ({ month: m[1]! }) },
  {
    re: /^This run is (\w+) and can no longer be changed\.$/,
    key: "This run is {status} and can no longer be changed.",
    vars: (m, t) => ({ status: t(m[1]!) }),
  },
  {
    re: /^A (\w+) run cannot be marked (\w+)\.$/,
    key: "A {from} run cannot be marked {to}.",
    vars: (m, t) => ({ from: t(m[1]!), to: t(m[2]!) }),
  },
  { re: /^This request is already (\w+)\.$/, key: "This request is already {status}.", vars: (m, t) => ({ status: t(m[1]!) }) },
  {
    re: /^Invalid role key "(.*)": must be lowercase letters, digits, and hyphens only$/,
    key: "Invalid role key «{key}»: use lowercase letters, digits and hyphens only.",
    vars: (m) => ({ key: m[1]! }),
  },
  { re: /^Role with key "(.*)" already exists$/, key: "A role with the key «{key}» already exists.", vars: (m) => ({ key: m[1]! }) },
  { re: /^Cannot delete system role "(.*)"$/, key: "The system role «{key}» can't be deleted.", vars: (m) => ({ key: m[1]! }) },
  { re: /^Role "(.*)" not found$/, key: "Role not found.", vars: () => ({}) },
  { re: /^Invalid permission key\(s\): (.*)$/, key: "Unknown permission: {keys}", vars: (m) => ({ keys: m[1]! }) },
  {
    re: /^Invalid tier key "(.*)": must be lowercase letters, digits, and hyphens only$/,
    key: "Invalid tier key «{key}»: use lowercase letters, digits and hyphens only.",
    vars: (m) => ({ key: m[1]! }),
  },
  { re: /^Invalid discountPct "(.*)": must be between 0 and 100$/, key: "The discount must be between 0 and 100.", vars: () => ({}) },
  { re: /^Tier with key "(.*)" already exists$/, key: "A tier with the key «{key}» already exists.", vars: (m) => ({ key: m[1]! }) },
  { re: /^Cannot delete system tier "(.*)"$/, key: "The system tier «{key}» can't be deleted.", vars: (m) => ({ key: m[1]! }) },
  { re: /^Tier "(.*)" not found$/, key: "Tier not found.", vars: () => ({}) },
];

/** A module error message in the staff locale (English stays exactly as thrown). */
export function translateError(t: T, message: string): string {
  const translated = t(message);
  if (translated !== message) return translated;
  for (const p of PATTERNS) {
    const m = message.match(p.re);
    if (m) {
      const out = t(p.key, p.vars(m, t));
      // In English the template differs from the original wording: keep the original.
      return t(p.key) === p.key ? message : out;
    }
  }
  return message;
}
