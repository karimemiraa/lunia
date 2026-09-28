"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkAddTagAction, bulkAssignOwnerAction } from "./actions";

export interface ClientRowDTO {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  stage: string;
  stageLabel: string;
  stageColor: string;
  ownerName: string | null;
  source: string | null;
  tierName: string | null;
  tags: string[];
  ltvMinor: number;
  owedMinor: number;
  bookingCount: number;
  lastVisitIso: string | null;
  nextAppointmentIso: string | null;
  nextFollowUpIso: string | null;
  status: "new" | "active" | "lapsed";
}

interface ClientsTableProps {
  rows: ClientRowDTO[];
  staff: { id: string; name: string }[];
  canManage: boolean;
  canBroadcast: boolean;
}

type ColumnKey = "stage" | "owner" | "source" | "tier" | "tags" | "ltv" | "owed" | "visits" | "lastVisit" | "nextAppt" | "status";
const ALL_COLUMNS: { key: ColumnKey; label: string; align?: "end" }[] = [
  { key: "stage", label: "Stage" },
  { key: "owner", label: "Owner" },
  { key: "source", label: "Source" },
  { key: "tier", label: "Tier" },
  { key: "tags", label: "Tags" },
  { key: "ltv", label: "LTV", align: "end" },
  { key: "owed", label: "Owed", align: "end" },
  { key: "visits", label: "Visits", align: "end" },
  { key: "lastVisit", label: "Last visit" },
  { key: "nextAppt", label: "Next appt" },
  { key: "status", label: "Status" },
];
const DEFAULT_COLUMNS: ColumnKey[] = ["stage", "owner", "source", "ltv", "nextAppt", "status"];
const COLUMNS_KEY = "lunia.clients.columns.v1";
const DENSITY_KEY = "lunia.clients.density.v1";

const CENTER_TZ = "Asia/Riyadh";
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, day: "numeric", month: "short", year: "numeric" });
const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "None");
const fmtSar = (minor: number) => `${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} SAR`;

const STATUS_META = {
  active: { label: "Active", className: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]" },
  new: { label: "New", className: "bg-[var(--color-gold)]/25 text-[#7c6a2f]" },
  lapsed: { label: "Lapsed", className: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/55" },
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); preferences just don't persist.
  }
}

// The roster: table on md+ (cards below), with a persisted column chooser,
// density toggle, keyboard row navigation (arrows / j / k, Enter opens, Space
// selects) and a bulk-selection bar wired to the tag/owner server actions.
export function ClientsTable({ rows, staff, canManage, canBroadcast }: ClientsTableProps) {
  const router = useRouter();
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [dense, setDense] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [cursor, setCursor] = useState(-1);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [tag, setTag] = useState("");
  const [owner, setOwner] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  // Preferences live in localStorage; read once after mount so SSR markup matches.
  useEffect(() => {
    const stored = readJson<ColumnKey[]>(COLUMNS_KEY, DEFAULT_COLUMNS).filter((k) => ALL_COLUMNS.some((c) => c.key === k));
    const density = readJson<string>(DENSITY_KEY, "comfortable");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of persisted preferences
    setColumns(stored.length ? stored : DEFAULT_COLUMNS);
    setDense(density === "compact");
    setPrefsLoaded(true);
  }, []);

  function toggleColumn(key: ColumnKey) {
    setColumns((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : ALL_COLUMNS.map((c) => c.key).filter((k) => k === key || cur.includes(k));
      writeJson(COLUMNS_KEY, next);
      return next;
    });
  }
  function toggleDensity() {
    setDense((d) => {
      writeJson(DENSITY_KEY, d ? "comfortable" : "compact");
      return !d;
    });
  }

  const visible = useMemo(() => ALL_COLUMNS.filter((c) => columns.includes(c.key)), [columns]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (rows.length === 0) return;
    const target = e.target as HTMLElement;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) && target.getAttribute("type") !== "checkbox") return;
    let next = cursor;
    if (e.key === "ArrowDown" || e.key === "j") next = Math.min(rows.length - 1, cursor + 1);
    else if (e.key === "ArrowUp" || e.key === "k") next = Math.max(0, cursor - 1);
    else if (e.key === "Enter" && cursor >= 0) {
      e.preventDefault();
      router.push(`/admin/clients/${rows[cursor]!.id}`);
      return;
    } else if (e.key === " " && cursor >= 0 && canManage) {
      e.preventDefault();
      toggleSelect(rows[cursor]!.id);
      return;
    } else return;
    e.preventDefault();
    setCursor(next);
    tableRef.current?.querySelectorAll<HTMLElement>("[data-row]")[next]?.scrollIntoView({ block: "nearest" });
  }

  function runBulk(label: string, action: () => Promise<{ ok: true; count: number } | { ok: false; error: string }>) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setNotice({ tone: "ok", text: `${label} for ${result.count} customer${result.count === 1 ? "" : "s"}.` });
        setSelected(new Set());
        router.refresh();
      } else setNotice({ tone: "error", text: result.error });
    });
  }

  const cell = dense ? "px-3 py-1.5" : "px-4 py-3";
  const ids = [...selected];

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar: density + columns */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-ink)]/55" aria-live="polite">
          {rows.length} {rows.length === 1 ? "customer" : "customers"}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggleDensity} aria-pressed={dense} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9" disabled={!prefsLoaded}>
            {dense ? "Comfortable" : "Compact"}
          </button>
          <div className="relative">
            <button type="button" onClick={() => setChooserOpen((o) => !o)} aria-expanded={chooserOpen} aria-haspopup="true" className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9" disabled={!prefsLoaded}>
              Columns
            </button>
            {chooserOpen && (
              <div className="absolute end-0 z-20 mt-1 flex w-48 flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-md)]" role="group" aria-label="Choose columns">
                {ALL_COLUMNS.map((c) => (
                  <label key={c.key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm text-[var(--color-ink)] hover:bg-[var(--surface-2)]">
                    <input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggleColumn(c.key)} className="h-4 w-4 accent-[var(--color-teal-ink)]" />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk bar */}
      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-teal)]/50 bg-[var(--color-teal)]/10 px-3 py-2" data-testid="bulk-bar">
          <span className="text-sm font-medium text-[var(--color-ink)]">{selected.size} selected</span>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              runBulk("Tag added", () => bulkAddTagAction(ids, tag));
            }}
          >
            <label className="sr-only" htmlFor="bulk-tag">
              Tag to add
            </label>
            <input id="bulk-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag" maxLength={40} className="lunia-input min-h-9 w-32 py-1 text-sm" />
            <button type="submit" disabled={isPending || !tag.trim()} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-9 disabled:opacity-60">
              Add tag
            </button>
          </form>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              runBulk("Owner set", () => bulkAssignOwnerAction(ids, owner));
            }}
          >
            <label className="sr-only" htmlFor="bulk-owner">
              Owner
            </label>
            <select id="bulk-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="lunia-input min-h-9 w-40 py-1 text-sm">
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={isPending} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-9 disabled:opacity-60">
              Assign owner
            </button>
          </form>
          {canBroadcast && (
            <Link href="/admin/comms/broadcast" className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9" title="Tag the selection first, then pick the audience in Broadcast">
              Broadcast
            </Link>
          )}
          <button type="button" onClick={() => setSelected(new Set())} className="lunia-btn lunia-btn-ghost lunia-btn-sm ms-auto min-h-9">
            Clear
          </button>
        </div>
      )}
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} aria-live="polite" className={`text-sm ${notice.tone === "error" ? "text-red-700" : "text-[var(--color-teal-ink)]"}`}>
          {notice.text}
        </p>
      )}

      {/* Table (md+) */}
      <div
        ref={tableRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Customers. Use arrow keys to move, Enter to open, Space to select."
        className="hidden overflow-x-auto lunia-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] md:block"
      >
        <table className="w-full text-left text-sm" data-testid="clients-table">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
              {canManage && (
                <th className={`${cell} w-8`}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 accent-[var(--color-teal-ink)]" />
                </th>
              )}
              <th className={`${cell} font-semibold`}>Customer</th>
              {visible.map((c) => (
                <th key={c.key} className={`${cell} font-semibold ${c.align === "end" ? "text-end" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visible.length + 2} className="px-4 py-12 text-center text-[var(--color-ink)]/55">
                  No customers match this view. Try clearing the filters or add a lead.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr
                  key={r.id}
                  data-row
                  data-testid="client-row"
                  data-client-id={r.id}
                  aria-selected={selected.has(r.id)}
                  className={`border-t border-[var(--line)] transition-colors duration-150 ease-out hover:bg-[var(--color-teal)]/[0.06] ${cursor === i ? "bg-[var(--color-teal)]/[0.1] ring-1 ring-inset ring-[var(--color-teal)]" : ""} ${selected.has(r.id) ? "bg-[var(--color-teal)]/[0.08]" : ""}`}
                >
                  {canManage && (
                    <td className={cell}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} aria-label={`Select ${r.fullName}`} className="h-4 w-4 accent-[var(--color-teal-ink)]" />
                    </td>
                  )}
                  <td className={cell}>
                    <Link href={`/admin/clients/${r.id}`} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-teal-ink)] hover:underline">
                      {r.fullName || "Unnamed customer"}
                    </Link>
                    <div className="text-xs text-[var(--color-ink)]/50">{r.phone ?? r.email ?? "None"}</div>
                  </td>
                  {visible.map((c) => (
                    <td key={c.key} className={`${cell} ${c.align === "end" ? "text-end" : ""} text-[var(--color-ink)]/75`}>
                      <Cell row={r} col={c.key} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Cards (below md) */}
      <ul className="flex flex-col gap-2 md:hidden" data-testid="clients-cards">
        {rows.length === 0 ? (
          <li className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--color-ink)]/55">No customers match this view.</li>
        ) : (
          rows.map((r) => (
            <li key={r.id} className="lunia-card flex items-start gap-3 px-4 py-3">
              {canManage && <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} aria-label={`Select ${r.fullName}`} className="mt-1 h-5 w-5 accent-[var(--color-teal-ink)]" />}
              <Link href={`/admin/clients/${r.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-[var(--color-ink)]">{r.fullName || "Unnamed customer"}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${STATUS_META[r.status].className}`}>{STATUS_META[r.status].label}</span>
                </span>
                <span className="text-xs text-[var(--color-ink)]/55">{r.phone ?? r.email ?? "No contact"}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-ink)]/65">
                  <span>{r.stageLabel}</span>
                  <span>{fmtSar(r.ltvMinor)}</span>
                  {r.owedMinor > 0 && <span className="text-[#7c6a2f]">Owes {fmtSar(r.owedMinor)}</span>}
                  {r.nextAppointmentIso && <span>Next {fmtDate(r.nextAppointmentIso)}</span>}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function Cell({ row, col }: { row: ClientRowDTO; col: ColumnKey }) {
  switch (col) {
    case "stage":
      return (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)]/[0.06] px-2.5 py-0.5 text-xs font-medium text-[var(--color-ink)]/75">
            <span className="h-2 w-2 rounded-full" style={{ background: row.stageColor || "var(--color-ink)" }} />
            {row.stageLabel}
          </span>
          {row.nextFollowUpIso && <div className="mt-0.5 text-[0.7rem] text-[var(--color-ink)]/45">Follow up {fmtDate(row.nextFollowUpIso)}</div>}
        </>
      );
    case "owner":
      return <>{row.ownerName ?? "Unassigned"}</>;
    case "source":
      return <>{row.source ?? "None"}</>;
    case "tier":
      return <>{row.tierName ?? "Guest"}</>;
    case "tags":
      return row.tags.length ? (
        <span className="flex flex-wrap gap-1">
          {row.tags.map((t) => (
            <span key={t} className="rounded-full bg-[var(--color-teal)]/15 px-2 py-0.5 text-[0.65rem] font-medium text-[var(--color-teal-ink)]">
              {t}
            </span>
          ))}
        </span>
      ) : (
        <>None</>
      );
    case "ltv":
      return <span className="font-medium tabular-nums text-[var(--color-ink)]">{fmtSar(row.ltvMinor)}</span>;
    case "owed":
      return row.owedMinor > 0 ? <span className="font-medium tabular-nums text-[#7c6a2f]">{fmtSar(row.owedMinor)}</span> : <span className="tabular-nums">0 SAR</span>;
    case "visits":
      return <span className="tabular-nums">{row.bookingCount}</span>;
    case "lastVisit":
      return <>{fmtDate(row.lastVisitIso)}</>;
    case "nextAppt":
      return <>{fmtDate(row.nextAppointmentIso)}</>;
    case "status":
      return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_META[row.status].className}`}>{STATUS_META[row.status].label}</span>;
    default:
      return null;
  }
}
