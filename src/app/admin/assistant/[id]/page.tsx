import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getChatSessionDetail } from "@/modules/assistant/admin";
import { buildConsultSummary } from "@/modules/assistant/leads";
import { displayPhone } from "@/modules/assistant/phone";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { StatusPill, formatDateTime } from "../_ui";

export default async function AssistantSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);
  const { id } = await params;
  const s = await getChatSessionDetail(id);
  if (!s) notFound();

  const summary = buildConsultSummary({ profile: s.profile, recommended: s.recommended.map((r) => r.name), outcome: s.outcome });

  return (
    <AdminShell
      user={user}
      title={s.name || "Anonymous visitor"}
      description={`Website assistant conversation started ${formatDateTime(s.createdAt)} (${s.locale.toUpperCase()}).`}
      actions={
        <Link href="/admin/assistant" className="lunia-btn lunia-btn-ghost">
          All conversations
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Transcript" className="lunia-card p-4 sm:p-6">
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">Transcript</h2>
          <ol className="flex flex-col gap-3">
            {s.transcript.map((m, i) => (
              <li key={i} className={`flex flex-col ${m.from === "user" ? "items-end" : "items-start"}`}>
                <div
                  dir="auto"
                  className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.from === "user" ? "bg-[var(--color-forest)] text-[var(--color-cream)]" : "bg-[var(--surface-2)] text-[var(--color-ink)]"
                  }`}
                >
                  {m.text}
                  {m.cards && m.cards.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 border-t border-[var(--color-ink)]/10 pt-2 text-xs">
                      {m.cards.map((c) => (
                        <li key={c.serviceId}>
                          <span className="font-medium">{c.name}</span> · {c.duration} · {c.price}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.summary && (
                    <dl className="mt-2 border-t border-[var(--color-ink)]/10 pt-2 text-xs">
                      {m.summary.rows.map((r) => (
                        <div key={r.label} className="flex gap-2">
                          <dt className="opacity-60">{r.label}:</dt>
                          <dd>{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
                <span className="mt-1 text-[0.68rem] text-[var(--color-ink)]/45">
                  {m.from === "user" ? "Visitor" : "Assistant"} · {formatDateTime(m.at)}
                  {m.step ? ` · ${m.step}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="lunia-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">Outcome</h2>
              <StatusPill value={s.outcome} />
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--color-ink)]/50">Phone</dt>
                <dd>{s.phone ? <a className="underline" href={`tel:${s.phone}`}>{displayPhone(s.phone)}</a> : "Not given"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--color-ink)]/50">Customer</dt>
                <dd>
                  {s.client ? (
                    <Link className="underline" href={`/admin/clients/${s.client.id}`}>
                      {s.client.fullName || "Open customer"}
                    </Link>
                  ) : (
                    "Not linked"
                  )}
                </dd>
              </div>
              {s.booking && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[var(--color-ink)]/50">Booking</dt>
                  <dd>
                    {s.booking.serviceName} · {formatDateTime(s.booking.startAt)} · {s.booking.status}
                    {s.booking.startAt && (
                      <Link className="ms-1 underline" href={`/admin/calendar?day=${utcToCenterLocal(s.booking.startAt).dateISO}`}>
                        Calendar
                      </Link>
                    )}
                  </dd>
                </div>
              )}
              {s.callbacks.length > 0 && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[var(--color-ink)]/50">Call-backs</dt>
                  {s.callbacks.map((c) => (
                    <dd key={c.id} className="flex items-center gap-2">
                      <StatusPill value={c.status} />
                      <Link className="underline" href="/admin/callbacks">
                        {c.preferredWindow ?? "any time"} · due {formatDateTime(c.dueAt)}
                      </Link>
                    </dd>
                  ))}
                </div>
              )}
            </dl>
          </div>

          <div className="lunia-card p-4">
            <h2 className="mb-2 font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">Consultation summary</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-ink)]/80">{summary}</p>
          </div>

          {s.recommended.length > 0 && (
            <div className="lunia-card p-4">
              <h2 className="mb-2 font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">Suggested services</h2>
              <ul className="list-inside list-disc text-sm text-[var(--color-ink)]/80">
                {s.recommended.map((r) => (
                  <li key={r.id}>{r.name}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}
