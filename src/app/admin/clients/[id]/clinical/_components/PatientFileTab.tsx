import Link from "next/link";
import { prisma } from "@/lib/db";
import { getIntakeOverview, CONCERN_LABELS, CONDITION_LABELS, MEDICATION_LABELS, PROCEDURE_LABELS, SKIN_TYPE_LABELS } from "@/modules/clinical/intake";
import { consentStatusForClient, listSignatures } from "@/modules/clinical/consents";
import { listTreatmentRecords } from "@/modules/clinical/treatments";
import { listClinicalPhotos } from "@/modules/clinical/photos";
import en from "@/messages/en.json";
import arMessages from "@/messages/ar.json";
import { getStaffT, getStaffLocale } from "../../../../_i18n/display";
import { intlLocale, type StaffLocale, type T } from "../../../../_i18n/t";

// The "Patient file" tab on the admin customer page (clinical:manage only):
// contraindication flags, intake summary, consent status, treatment timeline
// and recent photos. Everything that edits lives on its own sub-page under
// /admin/clients/[id]/clinical/ so this tab stays a calm overview.

const CENTER_TZ = "Asia/Riyadh";
const dFmtFor = (locale: StaffLocale) => new Intl.DateTimeFormat(intlLocale(locale, "en-US"), { timeZone: CENTER_TZ, dateStyle: "medium" });
const dtFmtFor = (locale: StaffLocale) => new Intl.DateTimeFormat(intlLocale(locale, "en-US"), { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" });

/** Intake contraindication flag text (src/modules/clinical/intakeRules) in the staff locale. */
function flagTitle(title: string, t: T): string {
  let m: RegExpMatchArray | null;
  if ((m = title.match(/^Isotretinoin within 6 months \((\d+) days ago\)$/))) return t("Isotretinoin within 6 months ({count} days ago)", { count: m[1] });
  if ((m = title.match(/^Recent (.+) \((\d+) days ago\)$/))) return t("Recent {procedure} ({count} days ago)", { procedure: t(m[1]!), count: m[2] });
  if ((m = title.match(/^Allergies: (.+)$/))) return t("Allergies: {list}", { list: m[1] });
  return t(title);
}

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

function Fact({ label, value, none }: { label: string; value: React.ReactNode; none: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-ink)]/50">{label}</dt>
      <dd className="text-sm text-[var(--color-ink)]">{value || <span className="text-[var(--color-ink)]/40">{none}</span>}</dd>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-5 text-center text-sm text-[var(--color-ink)]/55">{children}</p>
);

const PHOTO_KIND_LABEL: Record<string, string> = { BEFORE: "Before", AFTER: "After", ANALYSIS: "Analysis", OTHER: "Other" };

const btn = "lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11";
const btnPrimary = "lunia-btn lunia-btn-forest lunia-btn-sm min-h-11";

export async function PatientFileTab({ clientProfileId }: { clientProfileId: string }) {
  const base = `/admin/clients/${clientProfileId}/clinical`;
  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);
  const ar = locale === "ar";
  const dFmt = dFmtFor(locale);
  const dtFmt = dtFmtFor(locale);
  // Intake answer labels: the customer questionnaire's own Arabic in Arabic mode, the module's English otherwise.
  const h = ar ? arMessages.health : en.health;
  const pick = <K extends string>(english: Record<K, string>, arabic: Record<string, string>, key: K) => (ar ? (arabic[key] ?? english[key]) : english[key]);
  const list = (items: (string | false | null | undefined)[]) => items.filter(Boolean).join(ar ? "، " : ", ");
  const none = t("None");
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
      select: { id: true, startAt: true, service: { select: { nameEn: true, nameAr: true } } },
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
            <h3 className="text-sm font-semibold text-red-800">{t("For specialist review")}</h3>
            <p className="text-xs text-red-800/70">{t("Derived automatically from the questionnaire. Prompts to check, not medical advice.")}</p>
          </div>
          <ul className="grid gap-2 lg:grid-cols-2">
            {[...high, ...caution].map((f) => (
              <li key={f.key} className={`rounded-[var(--radius-sm)] border bg-white px-4 py-3 ${f.severity === "high" ? "border-red-300" : "border-amber-200"}`}>
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                  <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${f.severity === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                    {f.severity === "high" ? t("High") : t("Caution")}
                  </span>
                  {flagTitle(f.title, t)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink)]/65">{t("Review: {items}", { items: t(f.review) })}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card
        title={t("Health questionnaire")}
        action={
          <Link href={`${base}/intake`} className={a ? btn : btnPrimary}>
            {a ? t("Update answers") : t("Fill in at the desk")}
          </Link>
        }
      >
        {!overview.latest || !a ? (
          <Empty>{t("No questionnaire yet. The customer can fill it in from their account, or you can fill it in with them.")}</Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink)]/60">
              <span>
                {overview.latest.submittedBy === "STAFF"
                  ? t("Latest: {date} by staff", { date: dtFmt.format(overview.latest.createdAt) })
                  : t("Latest: {date} by the customer", { date: dtFmt.format(overview.latest.createdAt) })}
              </span>
              {overview.updatedSinceLastVisit && (
                <span className="rounded-full bg-[var(--color-gold)]/25 px-2.5 py-0.5 font-semibold text-[#7c6a2f]" data-testid="intake-changed">
                  {overview.changedSinceLastVisit === null
                    ? t("Updated since last visit")
                    : overview.changedSinceLastVisit.length === 0
                      ? t("Re-confirmed since last visit, no changes")
                      : t("Changed since last visit: {fields}", { fields: list(overview.changedSinceLastVisit.map((f) => t(f))) })}
                </span>
              )}
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Fact none={none} label={t("Skin type")} value={a.skinType ? pick(SKIN_TYPE_LABELS, arMessages.health.skinTypes, a.skinType) : ""} />
              <Fact none={none} label={t("Concerns")} value={list(a.concerns.map((c) => pick(CONCERN_LABELS, arMessages.health.concerns, c)))} />
              <Fact none={none} label={t("Pregnant / breastfeeding")} value={a.pregnant || a.breastfeeding ? list([a.pregnant && t("Pregnant"), a.breastfeeding && t("Breastfeeding")]) : t("No")} />
              <Fact none={none} label={t("Conditions")} value={list([...a.conditions.map((c) => pick(CONDITION_LABELS, arMessages.health.conditions, c)), a.conditionsOther])} />
              <Fact
                none={none}
                label={t("Medications")}
                value={list([
                  ...a.medications.map((m) => pick(MEDICATION_LABELS, arMessages.health.medications, m) + (m === "isotretinoin" && a.isotretinoinLastDose ? ` ${t("(last dose {date})", { date: a.isotretinoinLastDose })}` : "")),
                  a.medicationsOther,
                ])}
              />
              <Fact none={none} label={t("Allergies")} value={a.allergies} />
              <Fact none={none} label={t("Recent procedures")} value={list(a.recentProcedures.map((p) => `${pick(PROCEDURE_LABELS, arMessages.health.procedures, p.kind)}${p.date ? ` (${p.date})` : ""}`))} />
              <Fact none={none} label={t("Sun exposure")} value={list([a.sunExposure ? h.sunExposure[a.sunExposure] : "", a.recentTan ? t("Recent tan / sunburn") : ""])} />
              <Fact none={none} label={t("Goals")} value={a.goals} />
              {a.concerns.includes("hairLoss") && (
                <Fact
                  none={none}
                  label={t("Hair loss")}
                  value={list([a.hair.lossPattern ? h.hairPatterns[a.hair.lossPattern] : "", a.hair.duration ? h.hairDurations[a.hair.duration] : "", a.hair.notes])}
                />
              )}
              {a.concerns.includes("postSurgery") && (
                <Fact
                  none={none}
                  label={t("Surgery")}
                  value={[a.postSurgery.surgeryType, a.postSurgery.surgeryDate, a.postSurgery.surgeon && t("Dr {name}", { name: a.postSurgery.surgeon }), a.postSurgery.instructions].filter(Boolean).join(" · ")}
                />
              )}
              {a.notes && <Fact none={none} label={t("Notes")} value={a.notes} />}
            </dl>
            {overview.history.length > 1 && (
              <details className="text-xs text-[var(--color-ink)]/60">
                <summary className="cursor-pointer py-2">{t("History ({count} submissions)", { count: overview.history.length })}</summary>
                <ul className="flex flex-col gap-1 ps-4">
                  {overview.history.map((row) => (
                    <li key={row.id}>
                      {row.submittedBy === "STAFF" ? t("{date} by staff", { date: dtFmt.format(row.createdAt) }) : t("{date} by customer", { date: dtFmt.format(row.createdAt) })}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Card>

      <Card title={t("Consents")} action={<Link href="/admin/clinical/consents" className="text-xs text-[var(--color-ink)]/55 underline-offset-2 hover:underline">{t("Manage templates")}</Link>}>
        {consents.length === 0 ? (
          <Empty>{t("No active consent forms. Create them under Consent forms.")}</Empty>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="consent-status">
            {consents.map((c) => (
              <li key={c.formId} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-[var(--color-ink)]">
                    {ar ? c.titleAr || c.titleEn : c.titleEn} <span className="text-xs font-normal text-[var(--color-ink)]/45">v{c.version}{c.required ? "" : ` · ${t("optional")}`}</span>
                  </span>
                  <span className={`text-xs ${c.upToDate ? "text-[var(--color-teal-ink)]" : c.required ? "text-red-700" : "text-[var(--color-ink)]/55"}`}>
                    {c.upToDate && c.lastSignedAt
                      ? t("Signed {date}", { date: dFmt.format(c.lastSignedAt) })
                      : c.lastSignedAt
                        ? t("Signed v{version} on {date}. New version needs signing.", { version: c.lastSignedVersion, date: dFmt.format(c.lastSignedAt) })
                        : t("Not signed")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.lastSignatureId && (
                    <Link href={`${base}/consent/${c.lastSignatureId}`} className={btn}>
                      {t("View")}
                    </Link>
                  )}
                  {!c.upToDate && (
                    <Link href={`${base}/sign/${c.formId}`} className={btnPrimary}>
                      {t("Sign at desk")}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {signatures.length > 0 && (
          <details className="text-xs text-[var(--color-ink)]/60">
            <summary className="cursor-pointer py-2">{t("All signatures ({count})", { count: signatures.length })}</summary>
            <ul className="flex flex-col gap-1 ps-4">
              {signatures.map((s) => (
                <li key={s.id}>
                  <Link href={`${base}/consent/${s.id}`} className="underline-offset-2 hover:underline">
                    {ar ? s.consentForm.titleAr || s.consentForm.titleEn : s.consentForm.titleEn} v{s.formVersion}
                  </Link>{" "}
                  {s.witnessUserId
                    ? t("signed by {name} on {date} (at the desk)", { name: s.signerName, date: dtFmt.format(s.signedAt) })
                    : t("signed by {name} on {date}", { name: s.signerName, date: dtFmt.format(s.signedAt) })}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card
        title={t("Treatment records")}
        action={
          <Link href={`${base}/treatment`} className={btnPrimary}>
            {t("New record")}
          </Link>
        }
      >
        {awaiting.length > 0 && (
          <ul className="flex flex-col gap-2">
            {awaiting.map((appt) => (
              <li key={appt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-gold)]/45 bg-[var(--color-gold)]/8 px-4 py-2.5 text-sm">
                <span>
                  {t("{service}, {date}: no treatment record yet", { service: ar ? appt.service.nameAr || appt.service.nameEn : appt.service.nameEn, date: dtFmt.format(appt.startAt) })}
                </span>
                <Link href={`${base}/treatment?appointmentId=${appt.id}`} className={btn}>
                  {t("Record treatment")}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {treatments.length === 0 ? (
          <Empty>{t("No treatment records yet.")}</Empty>
        ) : (
          <ol className="flex flex-col gap-4 border-s border-[var(--line)] ps-5" data-testid="treatment-timeline">
            {treatments.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -start-[1.42rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--color-teal)] ring-4 ring-[var(--surface-2)]" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    {r.serviceName ?? t("Treatment")} <span className="font-normal text-[var(--color-ink)]/55">{t("by {name}", { name: r.performedByName })}</span>
                  </p>
                  <Link href={`${base}/treatment/${r.id}`} className="text-xs text-[var(--color-ink)]/55 underline-offset-2 hover:underline">
                    {t("Open")}
                  </Link>
                </div>
                <p className="text-xs text-[var(--color-ink)]/45">{dtFmt.format(r.performedAt)}</p>
                {r.settings.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--color-ink)]/70">{r.settings.map((s) => `${s.key}: ${s.value}`).join(" · ")}</p>
                )}
                {r.productsUsed.length > 0 && (
                  <p className="text-xs text-[var(--color-ink)]/70">{t("Products: {list}", { list: list(r.productsUsed.map((p) => [p.name, p.qty && `${p.qty}${p.unit ? ` ${p.unit}` : ""}`].filter(Boolean).join(" "))) })}</p>
                )}
                {r.skinReaction && <p className="text-xs text-[var(--color-ink)]/70">{t("Reaction: {reaction}", { reaction: r.skinReaction })}</p>}
                {r.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-ink)]/80">{r.notes}</p>}
                <p className="text-xs text-[var(--color-ink)]/45">
                  {[r.followUpAt && t("Follow-up {date}", { date: dFmt.format(r.followUpAt) }), r.photoCount > 0 && t(r.photoCount === 1 ? "1 photo" : "{count} photos", { count: r.photoCount })].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card
        title={t("Clinical photos")}
        action={
          <Link href={`${base}/photos`} className={photos.length ? btn : btnPrimary}>
            {photos.length ? t("All photos, upload & compare") : t("Upload photos")}
          </Link>
        }
      >
        {photos.length === 0 ? (
          <Empty>{t("No photos yet. Photos are private and only visible to staff with patient-file access.")}</Empty>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {photos.slice(0, 12).map((p) => (
              <li key={p.id} className="relative overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                <Link href={`${base}/photos#photo-${p.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated route; next/image would proxy it through the optimizer */}
                  <img src={`/admin/clinical/photo/${p.id}`} alt={`${t(PHOTO_KIND_LABEL[p.kind] ?? p.kind)} ${p.area ?? ""}`} loading="lazy" className="aspect-square w-full object-cover" />
                  <span className="absolute start-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-white">{ar ? t(PHOTO_KIND_LABEL[p.kind] ?? p.kind) : p.kind}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
