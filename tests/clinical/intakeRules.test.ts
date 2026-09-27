import { describe, it, expect } from "vitest";
import { deriveContraindicationFlags, diffIntakeAnswers, parseIntakeAnswers } from "@/modules/clinical/intakeRules";

const NOW = new Date("2026-09-27T10:00:00Z");
const answers = (raw: object) => parseIntakeAnswers(raw);
const keys = (raw: object) => deriveContraindicationFlags(answers(raw), NOW).map((f) => f.key);

describe("deriveContraindicationFlags", () => {
  it("returns no flags for an empty questionnaire", () => {
    expect(deriveContraindicationFlags(answers({}), NOW)).toEqual([]);
  });

  it("flags pregnancy and breastfeeding as high severity", () => {
    const [flag] = deriveContraindicationFlags(answers({ pregnant: true }), NOW);
    expect(flag.key).toBe("pregnancy");
    expect(flag.severity).toBe("high");
    expect(flag.review).toMatch(/peels/i);
    expect(keys({ breastfeeding: true })).toContain("pregnancy");
  });

  it("flags isotretinoin within 6 months, or with an unknown date, but not after", () => {
    expect(keys({ medications: ["isotretinoin"], isotretinoinLastDose: "2026-06-01" })).toContain("isotretinoin");
    expect(keys({ medications: ["isotretinoin"], isotretinoinLastDose: "" })).toContain("isotretinoin");
    expect(keys({ medications: ["isotretinoin"], isotretinoinLastDose: "2025-12-01" })).not.toContain("isotretinoin");
  });

  it("maps conditions and medications to their review flags", () => {
    const k = keys({
      conditions: ["keloid", "herpes", "epilepsy", "pacemaker"],
      medications: ["bloodThinners", "photosensitizing", "topicalRetinoids"],
      recentTan: true,
      allergies: "lidocaine",
    });
    expect(k).toEqual(
      expect.arrayContaining(["keloid", "herpes", "epilepsy", "pacemaker", "bloodThinners", "photosensitizing", "retinoids", "recentTan", "allergies"]),
    );
  });

  it("flags recent procedures only inside their window (14 days; 6 weeks for surgery)", () => {
    expect(keys({ recentProcedures: [{ kind: "peel", date: "2026-09-20" }] })).toContain("recent-peel");
    expect(keys({ recentProcedures: [{ kind: "peel", date: "2026-08-01" }] })).not.toContain("recent-peel");
    expect(keys({ recentProcedures: [{ kind: "surgery", date: "2026-08-25" }] })).toContain("recent-surgery");
  });

  it("orders high-severity flags before cautions", () => {
    const flags = deriveContraindicationFlags(answers({ medications: ["topicalRetinoids"], pregnant: true }), NOW);
    expect(flags[0].severity).toBe("high");
    expect(flags.at(-1)?.severity).toBe("caution");
  });

  it("drops unknown keys instead of trusting them", () => {
    expect(parseIntakeAnswers({ conditions: ["nonsense"] }).conditions).toEqual([]);
  });
});

describe("diffIntakeAnswers", () => {
  it("reports changed fields and ignores multi-select order", () => {
    const before = answers({ concerns: ["acne", "redness"], pregnant: false, allergies: "" });
    const after = answers({ concerns: ["redness", "acne"], pregnant: true, allergies: "latex" });
    expect(diffIntakeAnswers(before, after)).toEqual(["Allergies", "Pregnant"]);
  });
});
