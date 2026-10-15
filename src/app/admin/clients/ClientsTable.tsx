"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkAddTagAction, bulkAssignOwnerAction } from "./actions";
import { useStaffT, useStaffLocale } from "../_i18n/StaffI18n";
import { intlLocale, type StaffLocale, type T } from "../_i18n/t";

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
type SortKey = "name" | ColumnKey;
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
const PAGE_SIZE = 25;

const CENTER_TZ = "Asia/Riyadh";
const dateFmts: Partial<Record<StaffLocale, Intl.DateTimeFormat>> = {};
function dateFmt(locale: StaffLocale): Intl.DateTimeFormat {
  return (dateFmts[locale] ??= new Intl.DateTimeFormat(intlLocale(locale, "en-US"), { timeZone: CENTER_TZ, day: "numeric", month: "short", year: "numeric" }));
}
const fmtDate = (iso: string | null, locale: StaffLocale, t: T) => (iso ? dateFmt(locale).format(new Date(iso)) : t("None"));
const fmtSar = (minor: number, t: T) => `${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${t("SAR")}`;

const STATUS_META = {
  active: { label: "Active", className: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]" },
  new: { label: "New", className: "bg-[var(--color-gold)]/25 text-[#7c6a2f]" },
  lapsed: { label: "Lapsed", className: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/55" },
};

// Sort accessors: a plain comparable value per sortable key (null sorts last).
const SORT_VALUE: Record<SortKey, (r: ClientRowDTO) => string | number | null> = {
  name: (r) => r.fullName || "",
  stage: (r) => r.stageLabel,
  owner: (r) => r.ownerName,
  source: (r) => r.source,
  tier: (r) => r.tierName,
  tags: (r) => r.tags.length,
  ltv: (r) => r.ltvMinor,
  owed: (r) => r.owedMinor,
  visits: (r) => r.bookingCount,
  lastVisit: (r) => (r.lastVisitIso ? new Date(r.lastVisitIso).getTime() : null),
  nextAppt: (r) => (r.nextAppointmentIso ? new Date(r.nextAppointmentIso).getTime() : null),
  status: (r) => r.status,
};

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

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

function SortGlyph({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-3 w-3 shrink-0 transition-opacity ${dir ? "opacity-90" : "opacity-0 group-hover:opacity-40"}`}>
      {dir === "desc" ? <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /> : <path strokeLinecap="round" strokeLinejoin="round" d="m6 15 6-6 6 6" />}
    </svg>
  );
}

function SortableTh({
  sortKey,
  label,
  alignEnd,
  cell,
  sort,
  onSort,
}: {
  sortKey: SortKey;
  label: string;
  alignEnd?: boolean;
  cell: string;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort!.dir : null;
  return (
    <th aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"} className={`${cell} font-semibold ${alignEnd ? "text-end" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex min-h-8 items-center gap-1 rounded-sm uppercase tracking-[0.08em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${alignEnd ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        <SortGlyph dir={dir} />
      </button>
    </th>
  );
}

// The roster: table on md+ (cards below), with a persisted column chooser,
// density toggle, sortable headers, client-side pagination, keyboard row
// navigation (arrows / j / k, Enter opens, Space selects) and a
// bulk-selection bar wired to the tag/owner server actions.
export function ClientsTable({ rows, staff, canManage, canBroadcast }: ClientsTableProps) {
  const router = useRouter();
  const t = useStaffT();
  const locale = useStaffLocale();
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
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);
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

  function toggleSort(key: SortKey) {
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  const visible = useMemo(() => ALL_COLUMNS.filter((c) => columns.includes(c.key)), [columns]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const accessor = SORT_VALUE[sort.key];
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(accessor(a), accessor(b)) * factor);
  }, [rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 (and clear the keyboard cursor) when the result set or sort
  // changes — adjusting state during render per React's guidance.
  const pageKey = `${rows.length}|${sort?.key ?? ""}|${sort?.dir ?? ""}`;
  const [prevPageKey, setPrevPageKey] = useState(pageKey);
  if (pageKey !== prevPageKey) {
    setPrevPageKey(pageKey);
    setPage(1);
    setCursor(-1);
  }

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
    if (pageRows.length === 0) return;
    const target = e.target as HTMLElement;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) && target.getAttribute("type") !== "checkbox") return;
    let next = cursor;
    if (e.key === "ArrowDown" || e.key === "j") next = Math.min(pageRows.length - 1, cursor + 1);
    else if (e.key === "ArrowUp" || e.key === "k") next = Math.max(0, cursor - 1);
    else if (e.key === "Enter" && cursor >= 0) {
      e.preventDefault();
      router.push(`/admin/clients/${pageRows[cursor]!.id}`);
      return;
    } else if (e.key === " " && cursor >= 0 && canManage) {
      e.preventDefault();
      toggleSelect(pageRows[cursor]!.id);
      return;
    } else return;
    e.preventDefault();
    setCursor(next);
    tableRef.current?.querySelectorAll<HTMLElement>("[data-row]")[next]?.scrollIntoView({ block: "nearest" });
  }

  function runBulk(kind: "Tag added" | "Owner set", action: () => Promise<{ ok: true; count: number } | { ok: false; error: string }>) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setNotice({ tone: "ok", text:
            kind === "Tag added"
              ? t(result.count === 1 ? "Tag added for 1 customer." : "Tag added for {count} customers.", { count: result.count })
              : t(result.count === 1 ? "Owner set for 1 customer." : "Owner set for {count} customers.", { count: result.count }),
        });
        setSelected(new Set());
        router.refresh();
      } else setNotice({ tone: "error", text: result.error });
    });
  }

  const cell = dense ? "px-3 py-1.5" : "px-4 py-3";
  const ids = [...selected];
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, sorted.length);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar: density + columns */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-ink)]/55" aria-live="polite">
          {rows.length === 1 ? t("1 customer") : t("{count} customers", { count: rows.length })}
          {selected.size > 0 && ` · ${t("{count} selected", { count: selected.size })}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggleDensity} aria-pressed={dense} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9" disabled={!prefsLoaded}>
            {dense ? t("Comfortable") : t("Compact")}
          </button>
          <div className="relative">
            <button type="button" onClick={() => setChooserOpen((o) => !o)} aria-expanded={chooserOpen} aria-haspopup="true" className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9" disabled={!prefsLoaded}>
              {t("Columns")}
            </button>
            {chooserOpen && (
              <div className="absolute end-0 z-20 mt-1 flex w-48 flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-md)]" role="group" aria-label={t("Choose columns")}>
                {ALL_COLUMNS.map((c) => (
                  <label key={c.key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm text-[var(--color-ink)] hover:bg-[var(--surface-2)]">
                    <input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggleColumn(c.key)} className="h-4 w-4 accent-[var(--color-teal-ink)]" />
                    {t(c.label)}
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
          <span className="text-sm font-medium text-[var(--color-ink)]">{t("{count} selected", { count: selected.size })}</span>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              runBulk("Tag added", () => bulkAddTagAction(ids, tag));
            }}
          >
            <label className="sr-only" htmlFor="bulk-tag">
              {t("Tag to add")}
            </label>
            <input id="bulk-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t("Tag")} maxLength={40} className="lunia-input min-h-9 w-32 py-1 text-sm" />
            <button type="submit" disabled={isPending || !tag.trim()} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-9 disabled:opacity-60">
              {t("Add tag")}
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
              {t("Owner")}
            </label>
            <select id="bulk-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="lunia-input min-h-9 w-40 py-1 text-sm">
              <option value="">{t("Unassigned")}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={isPending} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-9 disabled:opacity-60">
              {t("Assign owner")}
            </button>
          </form>
          {canBroadcast && (
            <Link href="/admin/comms/broadcast" className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9" title={t("Tag the selection first, then pick the audience in Broadcast")}>
              {t("Broadcast")}
            </Link>
          )}
          <button type="button" onClick={() => setSelected(new Set())} className="lunia-btn lunia-btn-ghost lunia-btn-sm ms-auto min-h-9">
            {t("Clear")}
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
        aria-label={t("Customers. Use arrow keys to move, Enter to open, Space to select.")}
        className="hidden overflow-x-auto lunia-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] md:block"
      >
        <table className="w-full text-start text-sm" data-testid="clients-table">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
              {canManage && (
                <th className={`${cell} w-8`}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t("Select all")} className="h-4 w-4 accent-[var(--color-teal-ink)]" />
                </th>
              )}
              <SortableTh sortKey="name" label={t("Customer")} cell={cell} sort={sort} onSort={toggleSort} />
              {visible.map((c) => (
                <SortableTh key={c.key} sortKey={c.key} label={t(c.label)} alignEnd={c.align === "end"} cell={cell} sort={sort} onSort={toggleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visible.length + 2} className="px-4 py-12 text-center text-[var(--color-ink)]/55">
                  {t("No customers match this view. Try clearing the filters or add a lead.")}
                </td>
              </tr>
            ) : (
              pageRows.map((r, i) => (
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
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} aria-label={t("Select {name}", { name: r.fullName })} className="h-4 w-4 accent-[var(--color-teal-ink)]" />
                    </td>
                  )}
                  <td className={cell}>
                    <Link href={`/admin/clients/${r.id}`} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-teal-ink)] hover:underline">
                      {r.fullName || t("Unnamed customer")}
                    </Link>
                    <div className="text-xs text-[var(--color-ink)]/50" dir="ltr">{r.phone ?? r.email ?? t("None")}</div>
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
          <li className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--color-ink)]/55">{t("No customers match this view.")}</li>
        ) : (
          pageRows.map((r) => (
            <li key={r.id} className="lunia-card flex items-start gap-3 px-4 py-3">
              {canManage && <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} aria-label={t("Select {name}", { name: r.fullName })} className="mt-1 h-5 w-5 accent-[var(--color-teal-ink)]" />}
              <Link href={`/admin/clients/${r.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-[var(--color-ink)]">{r.fullName || t("Unnamed customer")}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${STATUS_META[r.status].className}`}>{t(STATUS_META[r.status].label)}</span>
                </span>
                <span className="text-xs text-[var(--color-ink)]/55">{r.phone ?? r.email ?? t("No contact")}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-ink)]/65">
                  <span>{r.stageLabel}</span>
                  <span>{fmtSar(r.ltvMinor, t)}</span>
                  {r.owedMinor > 0 && <span className="text-[#7c6a2f]">{t("Owes {amount}", { amount: fmtSar(r.owedMinor, t) })}</span>}
                  {r.nextAppointmentIso && <span>{t("Next {date}", { date: fmtDate(r.nextAppointmentIso, locale, t) })}</span>}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>

      {/* Pagination */}
      {sorted.length > PAGE_SIZE && (
        <nav aria-label={t("Pagination")} className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-ink)]/65">
          <span className="tabular-nums">
            {t("{start}–{end} of {total}", { start: rangeStart, end: rangeEnd, total: sorted.length })}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 disabled:opacity-40" aria-label={t("Previous page")}>
              {t("Previous")}
            </button>
            <span className="px-2 tabular-nums" aria-current="page">
              {safePage} / {pageCount}
            </span>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 disabled:opacity-40" aria-label={t("Next page")}>
              {t("Next")}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

function Cell({ row, col }: { row: ClientRowDTO; col: ColumnKey }) {
  const t = useStaffT();
  const locale = useStaffLocale();
  switch (col) {
    case "stage":
      return (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)]/[0.06] px-2.5 py-0.5 text-xs font-medium text-[var(--color-ink)]/75">
            <span className="h-2 w-2 rounded-full" style={{ background: row.stageColor || "var(--color-ink)" }} />
            {row.stageLabel}
          </span>
          {row.nextFollowUpIso && <div className="mt-0.5 text-[0.7rem] text-[var(--color-ink)]/45">{t("Follow up {date}", { date: fmtDate(row.nextFollowUpIso, locale, t) })}</div>}
        </>
      );
    case "owner":
      return <>{row.ownerName ?? t("Unassigned")}</>;
    case "source":
      return <>{row.source ?? t("None")}</>;
    case "tier":
      return <>{row.tierName ?? t("Guest")}</>;
    case "tags":
      return row.tags.length ? (
        <span className="flex flex-wrap gap-1">
          {row.tags.map((tg) => (
            <span key={tg} className="rounded-full bg-[var(--color-teal)]/15 px-2 py-0.5 text-[0.65rem] font-medium text-[var(--color-teal-ink)]">
              {tg}
            </span>
          ))}
        </span>
      ) : (
        <>{t("None")}</>
      );
    case "ltv":
      return <span className="font-medium tabular-nums text-[var(--color-ink)]">{fmtSar(row.ltvMinor, t)}</span>;
    case "owed":
      return row.owedMinor > 0 ? <span className="font-medium tabular-nums text-[#7c6a2f]">{fmtSar(row.owedMinor, t)}</span> : <span className="tabular-nums">{fmtSar(0, t)}</span>;
    case "visits":
      return <span className="tabular-nums">{row.bookingCount}</span>;
    case "lastVisit":
      return <>{fmtDate(row.lastVisitIso, locale, t)}</>;
    case "nextAppt":
      return <>{fmtDate(row.nextAppointmentIso, locale, t)}</>;
    case "status":
      return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_META[row.status].className}`}>{t(STATUS_META[row.status].label)}</span>;
    default:
      return null;
  }
}
