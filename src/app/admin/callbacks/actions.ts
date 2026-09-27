"use server";

// Server actions for the call-back queue. Viewing needs client:view (checked
// by the page); every mutation here re-checks client:manage and is audited.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import {
  assignCallback,
  CALLBACK_OUTCOMES,
  CALLBACK_OUTCOME_LABELS,
  createCallbackRequest,
  logCallbackOutcome,
} from "@/modules/assistant/callbacks";
import { CALLBACK_WINDOWS } from "@/modules/assistant/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

function messageOf(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Please check the form.";
  return err instanceof Error ? err.message : "Something went wrong.";
}

const idSchema = z.string().min(1).max(64);

export async function assignToMeAction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  try {
    await assignCallback(idSchema.parse(id), admin.id);
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  await recordAudit({ actorUserId: admin.id, action: "CALLBACK_ASSIGN", entityType: "CallbackRequest", entityId: id, summary: "Assigned a call-back to themselves" });
  revalidatePath("/admin/callbacks");
  return { ok: true };
}

const outcomeSchema = z.object({
  id: idSchema,
  outcome: z.enum(CALLBACK_OUTCOMES),
  note: z.string().trim().max(2000).optional(),
});

export async function logOutcomeAction(input: z.input<typeof outcomeSchema>): Promise<ActionResult> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  let data: z.infer<typeof outcomeSchema>;
  try {
    data = outcomeSchema.parse(input);
    await logCallbackOutcome({ id: data.id, outcome: data.outcome, note: data.note || undefined, byUserId: admin.id });
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  await recordAudit({
    actorUserId: admin.id,
    action: "CALLBACK_OUTCOME",
    entityType: "CallbackRequest",
    entityId: data.id,
    summary: `Logged call-back outcome: ${CALLBACK_OUTCOME_LABELS[data.outcome]}`,
  });
  revalidatePath("/admin/callbacks");
  return { ok: true };
}

export interface CreateCallbackState {
  error?: string;
  success?: boolean;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "A name is required").max(120),
  phone: z.string().trim().min(6, "A phone number is required").max(40),
  preferredWindow: z.enum(CALLBACK_WINDOWS),
  locale: z.enum(["ar", "en"]),
  topic: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function createCallbackAction(_prev: CreateCallbackState | null, formData: FormData): Promise<CreateCallbackState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  try {
    const data = createSchema.parse({
      name: formData.get("name"),
      phone: formData.get("phone"),
      preferredWindow: formData.get("preferredWindow") || "asap",
      locale: formData.get("locale") || "ar",
      topic: String(formData.get("topic") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "") || undefined,
    });
    const row = await createCallbackRequest({ ...data, source: "STAFF", acknowledge: false });
    await assignCallback(row.id, admin.id);
    await recordAudit({
      actorUserId: admin.id,
      action: "CALLBACK_CREATE",
      entityType: "CallbackRequest",
      entityId: row.id,
      summary: `Added a call-back for "${data.name}"`,
    });
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/admin/callbacks");
  return { success: true };
}
