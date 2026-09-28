import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The public site is themed purely through CSS tokens (globals.css "Website
// themes"). Any hardcoded colour in a component silently breaks Midnight or
// Aurora, so this lint fails the build the moment one sneaks back in.
const ROOTS = ["src/components/site", "src/app/[locale]"];

// Files allowed to carry a raw hex (none today; add a path + reason if a
// third-party brand colour ever has to live in a component).
const ALLOWLIST: Record<string, RegExp[]> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const BANNED = [
  { name: "bg-white", re: /\bbg-white\b/ },
  { name: "text-black", re: /\btext-black\b/ },
  { name: "text-white", re: /\btext-white\b/ },
  { name: "raw hex colour", re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/ },
  { name: "Tailwind palette colour", re: /\b(?:text|bg|border|ring)-(?:red|green|amber|emerald|slate|gray|zinc|neutral|stone|blue|sky|rose|yellow)-\d{2,3}\b/ },
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("public-site token lint", () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  for (const file of files) {
    it(`${file} uses theme tokens only`, () => {
      const src = stripComments(readFileSync(file, "utf8"));
      const allowed = ALLOWLIST[file] ?? [];
      const offences: string[] = [];
      src.split("\n").forEach((line, i) => {
        // SVG data URIs and URLs can legitimately carry # fragments / colours.
        const cleaned = line.replace(/url\([^)]*\)/g, "").replace(/https?:\/\/\S+/g, "");
        for (const rule of BANNED) {
          const m = cleaned.match(rule.re);
          if (m && !allowed.some((a) => a.test(line))) offences.push(`${i + 1}: ${rule.name} -> ${m[0]}`);
        }
      });
      expect(offences, offences.join("\n")).toEqual([]);
    });
  }
});
