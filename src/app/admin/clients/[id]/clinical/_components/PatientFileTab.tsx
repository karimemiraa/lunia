import Link from "next/link";
import { prisma } from "@/lib/db";
import { getIntakeOverview, CONCERN_LABELS, CONDITION_LABELS, MEDICATION_LABELS, PROCEDURE_LABELS, SKIN_TYPE_LABELS } from "@/modules/clinical/intake";
import { consentStatusForClient, listSignatures } from "@/modules/clinical/consents";
import { listTreatmentRecords } from "@/modules/clinical/treatments";
import { listClinicalPhotos } from "@/modules/clinical/photos";
import en from "@/messages/en.json";

// The "Patient file" tab on the admin customer page (clinical:manage only):
// contraindication flags, intake summary, consent status, treatment timeline
// and recent photos. Everything that edits lives on its own sub-page under
// /admin/clients/[id]/clinical/ so this tab stays a calm overview.

const CENTER_TZ = "Asia/Riyadh";
const dFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium" });
const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" });

const h = en.health;

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="lunia-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-ink)]/50">{label}</dt>
      <dd className="text-sm text-[var(--color-ink)]">{value || <span className="text-[var(--color-ink)]/40">None</span>}</dd>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-5 text-center text-sm text-[var(--color-ink)]/55">{children}</p>
);

const btn = "lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11";
const btnPrimary = "lunia-btn lunia-btn-forest lunia-btn-sm min-h-11";

export async function PatientFileTab({ clientProfileId }: { clientProfileId: string }) {
  const base = `/admin/clients/${clientProfileId}/clinical`;
  const [overview, consents, signatures, treatments, photos, visits] = await Promise.all([
    getIntakeOverview(clientProfileId),
    consentStatusForClient(clientProfileId),
    listSignatures(clientProfileId),
    listTreatmentRecords(clientProfileId),
    listClinicalPhotos(clientProfileId),
    prisma.appointment.findMany({
      where: { booking: { clientProfileId, status: { in: ["CHECKED_IN", "COMPLETED"] } } },
      orderBy: { startAt: "desc" },
      take: 20,
      select: { id: true, startAt: true, service: { select: { nameEn: true } } },
    }),
  ]);
  // Visits that happened (or are in progress) with no treatment record yet.
  const recorded = new Set(treatments.map((r) => r.appointmentId).filter(Boolean));
  const awaiting = visits.filter((v) => !recorded.has(v.id)).slice(0, 5);
  const a = overview.latest?.answers;
  const high = overview.flags.filter((f) => f.severity === "high");
  const caution = overview.flags.filter((f) => f.severity === "caution");

  return (
    <div className="flex flex-col gap-6" data-testid="patient-file">
      {/* Flags first: the thing a specialist must see before treating. */}
      {overview.flags.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-red-200 bg-red-50/70 p-5" data-testid="contraindication-flags">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-red-800">For specialist review</h3>
            <p className="text-xs text-red-800/70">Derived automatically from the questionnaire. Prompts to check, not medical advice.</p>
          </div>
          <ul className="grid gap-2 lg:grid-cols-2">
            {[...high, ...caution].map((f) => (
              <li key={f.key} className={`rounded-[var(--radius-sm)] border bg-white px-4 py-3 ${f.severity === "high" ? "border-red-300" : "border-amber-200"}`}>
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                  <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${f.severity === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                    {f.severity === "high" ? "High" : "Caution"}
                  </span>
                  {f.title}
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink)]/65">Review: {f.review}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card
        title="Health questionnaire"
        action={
          <Link href={`${base}/intake`} className={a ? btn : btnPrimary}>
            {a ? "Update answers" : "Fill in at the desk"}
          </Link>
        }
      >
        {!overview.latest || !a ? (
          <Empty>No questionnaire yet. The customer can fill it in from their account, or you can fill it in with them.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink)]/60">
              <span>
                Latest: {dtFmt.format(overview.latest.createdAt)} by {overview.latest.submittedBy === "STAFF" ? "staff" : "the customer"}
              </span>
              {overview.updatedSinceLastVisit && (
                <span className="rounded-full bg-[var(--color-gold)]/25 px-2.5 py-0.5 font-semibold text-[#7c6a2f]" data-testid="intake-changed">
                  {overview.changedSinceLastVisit === null
                    ? "Updated since last visit"
                    : overview.changedSinceLastVisit.length === 0
                      ? "Re-confirmed since last visit, no changes"
                      : `Changed since last visit: ${overview.changedSinceLastVisit.join(", ")}`}
                </span>
              )}
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Skin type" value={a.skinType ? SKIN_TYPE_LABELS[a.skinType] : ""} />
              <Fact label="Concerns" value={a.concerns.map((c) => CONCERN_LABELS[c]).join(", ")} />
              <Fact label="Pregnant / breastfeeding" value={a.pregnant || a.breastfeeding ? [a.pregnant && "Pregnant", a.breastfeeding && "Breastfeeding"].filter(Boolean).join(", ") : "No"} />
              <Fact label="Conditions" value={[...a.conditions.map((c) => CONDITION_LABELS[c]), a.conditionsOther].filter(Boolean).join(", ")} />
              <Fact
                label="Medications"
                value={[
                  ...a.medications.map((m) => MEDICATION_LABELS[m] + (m === "isotretinoin" && a.isotretinoinLastDose ? ` (last dose ${a.isotretinoinLastDose})` : "")),
                  a.medicationsOther,
                ]
                  .filter(Boolean)
                  .join(", ")}
              />
              <Fact label="Allergies" value={a.allergies} />
              <Fact label="Recent procedures" value={a.recentProcedures.map((p) => `${PROCEDURE_LABELS[p.kind]}${p.date ? ` (${p.date})` : ""}`).join(", ")} />
              <Fact label="Sun exposure" value={[a.sunExposure ? h.sunExposure[a.sunExposure] : "", a.recentTan ? "Recent tan / sunburn" : ""].filter(Boolean).join(", ")} />
              <Fact label="Goals" value={a.goals} />
              {a.concerns.includes("hairLoss") && (
                <Fact
                  label="Hair loss"
                  value={[a.hair.lossPattern ? h.hairPatterns[a.hair.lossPattern] : "", a.hair.duration ? h.hairDurations[a.hair.duration] : "", a.hair.notes].filter(Boolean).join(", ")}
                />
              )}
              {a.concerns.includes("postSurgery") && (
                <Fact
                  label="Surgery"
                  value={[a.postSurgery.surgeryType, a.postSurgery.surgeryDate, a.postSurgery.surgeon && `Dr ${a.postSurgery.surgeon}`, a.postSurgery.instructions].filter(Boolean).join(" · ")}
                />
              )}
              {a.notes && <Fact label="Notes" value={a.notes} />}
            </dl>
            {overview.history.length > 1 && (
              <details className="text-xs text-[var(--color-ink)]/60">
                <summary className="cursor-pointer py-2">History ({overview.history.length} submissions)</summary>
                <ul className="flex flex-col gap-1 ps-4">
                  {overview.history.map((row) => (
                    <li key={row.id}>
                      {dtFmt.format(row.createdAt)} by {row.submittedBy === "STAFF" ? "staff" : "customer"}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Card>

      <Card title="Consents" action={<Link href="/admin/clinical/consents" className="text-xs text-[var(--color-ink)]/55 underline-offset-2 hover:underline">Manage templates</Link>}>
        {consents.length === 0 ? (
          <Empty>No active consent forms. Create them under Consent forms.</Empty>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="consent-status">
            {consents.map((c) => (
              <li key={c.formId} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-[var(--color-ink)]">
                    {c.titleEn} <span className="text-xs font-normal text-[var(--color-ink)]/45">v{c.version}{c.required ? "" : " · optional"}</span>
                  </span>
                  <span className={`text-xs ${c.upToDate ? "text-[var(--color-teal-ink)]" : c.required ? "text-red-700" : "text-[var(--color-ink)]/55"}`}>
                    {c.upToDate && c.lastSignedAt
                      ? `Signed ${dFmt.format(c.lastSignedAt)}`
                      : c.lastSignedAt
                        ? `Signed v${c.lastSignedVersion} on ${dFmt.format(c.lastSignedAt)}. New version needs signing.`
                        : "Not signed"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.lastSignatureId && (
                    <Link href={`${base}/consent/${c.lastSignatureId}`} className={btn}>
                      View
                    </Link>
                  )}
                  {!c.upToDate && (
                    <Link href={`${base}/sign/${c.formId}`} className={btnPrimary}>
                      Sign at desk
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {signatures.length > 0 && (
          <details className="text-xs text-[var(--color-ink)]/60">
            <summary className="cursor-pointer py-2">All signatures ({signatures.length})</summary>
            <ul className="flex flex-col gap-1 ps-4">
              {signatures.map((s) => (
                <li key={s.id}>
                  <Link href={`${base}/consent/${s.id}`} className="underline-offset-2 hover:underline">
                    {s.consentForm.titleEn} v{s.formVersion}
                  </Link>{" "}
                  signed by {s.signerName} on {dtFmt.format(s.signedAt)}
                  {s.witnessUserId ? " (at the desk)" : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card
        title="Treatment records"
        action={
          <Link href={`${base}/treatment`} className={btnPrimary}>
            New record
          </Link>
        }
      >
        {awaiting.length > 0 && (
          <ul className="flex flex-col gap-2">
            {awaiting.map((appt) => (
              <li key={appt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-gold)]/45 bg-[var(--color-gold)]/8 px-4 py-2.5 text-sm">
                <span>
                  {appt.service.nameEn}, {dtFmt.format(appt.startAt)}: no treatment record yet
                </span>
                <Link href={`${base}/treatment?appointmentId=${appt.id}`} className={btn}>
                  Record treatment
                </Link>
              </li>
            ))}
          </ul>
        )}
        {treatments.length === 0 ? (
          <Empty>No treatment records yet.</Empty>
        ) : (
          <ol className="flex flex-col gap-4 border-s border-[var(--line)] ps-5" data-testid="treatment-timeline">
            {treatments.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -start-[1.42rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--color-teal)] ring-4 ring-[var(--surface-2)]" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    {r.serviceName ?? "Treatment"} <span className="font-normal text-[var(--color-ink)]/55">by {r.performedByName}</span>
                  </p>
                  <Link href={`${base}/treatment/${r.id}`} className="text-xs text-[var(--color-ink)]/55 underline-offset-2 hover:underline">
                    Open
                  </Link>
                </div>
                <p className="text-xs text-[var(--color-ink)]/45">{dtFmt.format(r.performedAt)}</p>
                {r.settings.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--color-ink)]/70">{r.settings.map((s) => `${s.key}: ${s.value}`).join(" · ")}</p>
                )}
                {r.productsUsed.length > 0 && (
                  <p className="text-xs text-[var(--color-ink)]/70">Products: {r.productsUsed.map((p) => [p.name, p.qty && `${p.qty}${p.unit ? ` ${p.unit}` : ""}`].filter(Boolean).join(" ")).join(", ")}</p>
                )}
                {r.skinReaction && <p className="text-xs text-[var(--color-ink)]/70">Reaction: {r.skinReaction}</p>}
                {r.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-ink)]/80">{r.notes}</p>}
                <p className="text-xs text-[var(--color-ink)]/45">
                  {[r.followUpAt && `Follow-up ${dFmt.format(r.followUpAt)}`, r.photoCount > 0 && `${r.photoCount} photo${r.photoCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card
        title="Clinical photos"
        action={
          <Link href={`${base}/photos`} className={photos.length ? btn : btnPrimary}>
            {photos.length ? "All photos, upload & compare" : "Upload photos"}
          </Link>
        }
      >
        {photos.length === 0 ? (
          <Empty>No photos yet. Photos are private and only visible to staff with patient-file access.</Empty>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {photos.slice(0, 12).map((p) => (
              <li key={p.id} className="relative overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                <Link href={`${base}/photos#photo-${p.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated route; next/image would proxy it through the optimizer */}
                  <img src={`/admin/clinical/photo/${p.id}`} alt={`${p.kind} ${p.area ?? ""}`} loading="lazy" className="aspect-square w-full object-cover" />
                  <span className="absolute start-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-white">{p.kind}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
