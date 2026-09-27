// Medical-history questionnaire persistence (MedicalIntake). Rows are
// append-only: every submission (by the customer in their account, or by
// staff at the desk) is a new row, the latest row is the current answers, and
// older rows stay as the file's history. Rules/vocabulary: intakeRules.ts.

import { prisma } from "@/lib/db";
import {
  CONCERN_LABELS,
  SKIN_TYPE_LABELS,
  deriveContraindicationFlags,
  diffIntakeAnswers,
  intakeAnswersSchema,
  parseIntakeAnswers,
  type ContraindicationFlag,
  type IntakeAnswers,
} from "./intakeRules";

export * from "./intakeRules";

export interface SubmitIntakeInput {
  clientProfileId: string;
  answers: unknown;
  submittedBy: "CLIENT" | "STAFF";
  staffUserId?: string | null;
}

/**
 * Appends a new intake row and mirrors the headline answers (skin type,
 * concerns, allergies) onto ClientProfile so the roster/filters and the
 * existing Clinical tab stay in sync with the latest questionnaire.
 */
export async function submitIntake(input: SubmitIntakeInput) {
  const answers = intakeAnswersSchema.parse(input.answers ?? {});
  return prisma.$transaction(async (tx) => {
    const row = await tx.medicalIntake.create({
      data: {
        clientProfileId: input.clientProfileId,
        answers,
        submittedBy: input.submittedBy,
        staffUserId: input.submittedBy === "STAFF" ? (input.staffUserId ?? null) : null,
      },
    });
    await tx.clientProfile.update({
      where: { id: input.clientProfileId },
      data: {
        skinType: answers.skinType ? SKIN_TYPE_LABELS[answers.skinType] : undefined,
        skinConcerns: answers.concerns.length > 0 ? answers.concerns.map((c) => CONCERN_LABELS[c]) : undefined,
        allergies: answers.allergies || undefined,
      },
    });
    return row;
  });
}

export interface IntakeRow {
  id: string;
  answers: IntakeAnswers;
  submittedBy: string;
  staffUserId: string | null;
  createdAt: Date;
}

function toRow(r: { id: string; answers: unknown; submittedBy: string; staffUserId: string | null; createdAt: Date }): IntakeRow {
  return { ...r, answers: parseIntakeAnswers(r.answers) };
}

export async function getLatestIntake(clientProfileId: string): Promise<IntakeRow | null> {
  const r = await prisma.medicalIntake.findFirst({ where: { clientProfileId }, orderBy: { createdAt: "desc" } });
  return r ? toRow(r) : null;
}

export interface IntakeOverview {
  latest: IntakeRow | null;
  history: { id: string; submittedBy: string; createdAt: Date }[];
  flags: ContraindicationFlag[];
  lastVisitAt: Date | null;
  /** True when the latest answers were submitted after the last completed visit. */
  updatedSinceLastVisit: boolean;
  /** Fields changed versus the answers on file at the last visit (null = nothing to compare). */
  changedSinceLastVisit: string[] | null;
}

export async function getIntakeOverview(clientProfileId: string, now: Date = new Date()): Promise<IntakeOverview> {
  const [rows, lastVisit] = await Promise.all([
    prisma.medicalIntake.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.appointment.findFirst({
      where: { booking: { clientProfileId, status: "COMPLETED" }, startAt: { lte: now } },
      orderBy: { startAt: "desc" },
      select: { startAt: true },
    }),
  ]);
  const latest = rows[0] ? toRow(rows[0]) : null;
  const lastVisitAt = lastVisit?.startAt ?? null;
  const updatedSinceLastVisit = Boolean(latest && lastVisitAt && latest.createdAt > lastVisitAt);

  let changedSinceLastVisit: string[] | null = null;
  if (latest && lastVisitAt && updatedSinceLastVisit) {
    const baseline = rows.find((r) => r.createdAt <= lastVisitAt);
    if (baseline) changedSinceLastVisit = diffIntakeAnswers(parseIntakeAnswers(baseline.answers), latest.answers);
  }

  return {
    latest,
    history: rows.map((r) => ({ id: r.id, submittedBy: r.submittedBy, createdAt: r.createdAt })),
    flags: latest ? deriveContraindicationFlags(latest.answers, now) : [],
    lastVisitAt,
    updatedSinceLastVisit,
    changedSinceLastVisit,
  };
}
