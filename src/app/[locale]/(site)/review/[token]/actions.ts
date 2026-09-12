"use server";

// Server action backing the public tokenized review submit page
// (ReviewForm.tsx). Public (no auth) by design -- the token itself is the
// credential (crypto-random, single-use, see reviews.ts). Every known
// failure mode (invalid token, already used, bad rating) is mapped to
// bilingual copy here rather than leaking submitReview's plain-English
// Error.message to the client.

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { submitReview } from "@/modules/reviews/reviews";

export type ReviewLocale = "en" | "ar";

function asReviewLocale(locale: string): ReviewLocale {
  return locale === "ar" ? "ar" : "en";
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type SubmitReviewResult =
  | { ok: true }
  | { ok: false; error: string; alreadyUsed?: boolean };

const submitReviewActionSchema = z.object({
  token: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional(),
  body: z.string().trim().max(4000).optional(),
  authorDisplayName: z.string().trim().max(120).optional(),
  consentPublic: z.boolean(),
  locale: z.enum(["en", "ar"]),
});
export type SubmitReviewActionInput = z.input<typeof submitReviewActionSchema>;

export async function submitReviewAction(input: SubmitReviewActionInput): Promise<SubmitReviewResult> {
  const t = await getTranslations({ locale: asReviewLocale(input.locale), namespace: "review" });

  const parsed = submitReviewActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: t("ratingRequired") };
  }

  try {
    await submitReview(parsed.data.token, {
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
      authorDisplayName: parsed.data.authorDisplayName,
      consentPublic: parsed.data.consentPublic,
    });
    return { ok: true };
  } catch (err) {
    const message = messageOf(err);
    if (message.includes("already been submitted")) {
      return { ok: false, error: t("alreadySubmittedBody"), alreadyUsed: true };
    }
    if (message.includes("Invalid review link")) {
      return { ok: false, error: t("invalidBody") };
    }
    return { ok: false, error: t("errors.generic") };
  }
}
