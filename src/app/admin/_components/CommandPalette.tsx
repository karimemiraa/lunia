"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { SEARCH_GROUPS, SEARCH_GROUP_LABELS, type GlobalSearchResult, type SearchGroupKey } from "@/modules/search/groups";
import { paletteSearchAction } from "./search.actions";
import { I } from "./AdminNav";
import type { NavIconKey, PaletteAction } from "./navCatalog";

export type { PaletteAction };

export interface PalettePage {
  href: string;
  label: string;
  group: string;
  icon: NavIconKey;
  keywords?: string;
}

interface PaletteItem {
  id: string;
  label: string;
  sub?: string;
  href: string;
  section: string;
  badge?: string;
  icon: ReactNode;
}

interface CommandPaletteProps {
  pages: PalettePage[];
  actions: PaletteAction[];
}

export const PALETTE_OPEN_EVENT = "lunia:palette:open";
const RECENT_KEY = "lunia-palette-recent";
const RECENT_MAX = 8;
const DEBOUNCE_MS = 200;

/** Open the palette from anywhere (keyboard shortcuts, empty states). */
export function openPalette(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PALETTE_OPEN_EVENT));
}

const GROUP_ICON: Record<SearchGroupKey, NavIconKey> = {
  customers: "users",
  bookings: "calendar",
  invoices: "receipt",
  products: "box",
  employees: "users",
  inquiries: "inbox",
  conversations: "message",
  chats: "chat",
  callbacks: "phone",
};

const ActionIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[1.15rem] w-[1.15rem] shrink-0" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 3 5 13.5h6L10 21l9-11h-6l0-7Z" />
  </svg>
);
const ClockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[1.15rem] w-[1.15rem] shrink-0" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" /><path strokeLinecap="round" d="M12 7.5V12l3 2" />
  </svg>
);

function readRecent(): PaletteItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Omit<PaletteItem, "icon">[];
    return parsed.map((r) => ({ ...r, section: "Recent", icon: ClockIcon }));
  } catch {
    return [];
  }
}

function pushRecent(item: PaletteItem): void {
  try {
    const current = readRecent().filter((r) => r.href !== item.href);
    const next = [{ id: item.id, label: item.label, sub: item.sub, href: item.href, section: "Recent", badge: item.badge }, ...current].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function matchesQuery(text: string, q: string): boolean {
  const hay = text.toLowerCase();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => hay.includes(t));
}

function isMac(): boolean {
  return typeof navigator === "undefined" ? true : /Mac|iPhone|iPad/.test(navigator.userAgent);
}

export function CommandPalette({ pages, actions }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<PaletteItem[]>([]);
  // Rendered with suppressHydrationWarning: the server can't know the OS.
  const mac = isMac();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestSeq = useRef(0);
  const listId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setActive(0);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const show = useCallback(() => {
    setRecent(readRecent());
    setOpen(true);
  }, []);

  // Global open triggers: the custom event (shortcuts, "/" key) and Cmd/Ctrl+K.
  useEffect(() => {
    const onOpen = () => show();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else show();
      }
    };
    window.addEventListener(PALETTE_OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(PALETTE_OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, show, close]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Debounced record search (loading/reset state is set in onChange so the
  // effect only schedules the request).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) return;
    const seq = ++requestSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const res = await paletteSearchAction(q);
        if (seq !== requestSeq.current) return;
        setResults(res);
        setActive(0);
      } catch {
        if (seq === requestSeq.current) setResults(null);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const items: PaletteItem[] = useMemo(() => {
    const q = query.trim();
    const list: PaletteItem[] = [];
    const actionItems = actions
      .filter((a) => !q || matchesQuery(`${a.label} ${a.keywords ?? ""}`, q))
      .map((a) => ({ id: `act-${a.id}`, label: a.label, sub: a.hint, href: a.href, section: "Actions", icon: ActionIcon }));
    const pageItems = pages
      .filter((p) => !q || matchesQuery(`${p.label} ${p.group} ${p.keywords ?? ""}`, q))
      .map((p) => ({ id: `page-${p.href}`, label: p.label, sub: p.group, href: p.href, section: "Pages", icon: I[p.icon] }));

    if (!q) {
      list.push(...recent, ...actionItems, ...pageItems);
      return list;
    }
    if (results) {
      for (const g of SEARCH_GROUPS) {
        for (const hit of results[g]) {
          list.push({
            id: `${g}-${hit.id}`,
            label: hit.title,
            sub: hit.subtitle,
            href: hit.href,
            section: SEARCH_GROUP_LABELS[g],
            badge: hit.badge,
            icon: I[GROUP_ICON[g]],
          });
        }
      }
    }
    list.push(...actionItems, ...pageItems);
    return list;
  }, [query, actions, pages, recent, results]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(item: PaletteItem) {
    pushRecent(item);
    close();
    if (item.href.startsWith("http") || item.href === "/") window.open(item.href, "_blank", "noopener");
    else router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, items.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) go(item);
      else if (query.trim().length >= 2) {
        close();
        router.push(`/admin/search?q=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // Focus stays on the input: the list is driven by arrow keys.
      e.preventDefault();
    }
  }

  const q = query.trim();
  const searching = q.length >= 2;
  const noRecordHits = searching && results && SEARCH_GROUPS.every((g) => results[g].length === 0);

  // Group consecutive items by section for headings.
  const sections: { name: string; items: { item: PaletteItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = sections[sections.length - 1];
    if (last && last.name === item.section) last.items.push({ item, index });
    else sections.push({ name: item.section, items: [{ item, index }] });
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-10 flex-1 items-center gap-2.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--color-ink)]/55 shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-teal)] hover:text-[var(--color-ink)]/75 focus-visible:outline-none focus-visible:shadow-[var(--ring)] sm:max-w-md"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-3.5-3.5" />
        </svg>
        <span className="flex-1 truncate text-start">Search or jump to…</span>
        <span className="hidden items-center gap-1 sm:inline-flex" aria-hidden="true">
          <kbd className="lunia-kbd" suppressHydrationWarning>{mac ? "⌘" : "Ctrl"}</kbd>
          <kbd className="lunia-kbd">K</kbd>
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center bg-[var(--color-ink)]/40 p-3 pt-[8vh] backdrop-blur-sm sm:p-6 sm:pt-[12vh]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search and jump to"
              className="lunia-pop-in flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
            >
              <div className="flex items-center gap-3 border-b border-[var(--line)] px-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5 shrink-0 text-[var(--color-ink)]/45" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-3.5-3.5" />
                </svg>
                <input
                  ref={inputRef}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={items[active] ? `${listId}-${items[active].id}` : undefined}
                  aria-label="Search customers, bookings, invoices, products, pages and actions"
                  value={query}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuery(v);
                    setActive(0);
                    if (v.trim().length >= 2) setLoading(true);
                    else {
                      requestSeq.current++;
                      setResults(null);
                      setLoading(false);
                    }
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Type a name, phone, invoice number, SKU, or a page…"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-14 min-w-0 flex-1 bg-transparent text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink)]/40 focus:outline-none"
                />
                {loading && <span className="lunia-live-dot h-2 w-2 rounded-full bg-[var(--color-teal-ink)]" aria-hidden="true" />}
                <button type="button" onClick={close} className="lunia-kbd" aria-label="Close">
                  Esc
                </button>
              </div>

              <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
                {sections.map((section) => (
                  <li key={section.name} role="presentation">
                    <div className="px-4 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/45">{section.name}</div>
                    <ul role="group" aria-label={section.name}>
                      {section.items.map(({ item, index }) => {
                        const selected = index === active;
                        return (
                          <li
                            key={item.id}
                            id={`${listId}-${item.id}`}
                            role="option"
                            aria-selected={selected}
                            data-index={index}
                            onMouseEnter={() => setActive(index)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => go(item)}
                            className={`mx-2 flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors ${
                              selected ? "bg-[var(--color-teal)]/25 text-[var(--color-ink)]" : "text-[var(--color-ink)]/80"
                            }`}
                          >
                            <span className={selected ? "text-[var(--color-teal-ink)]" : "text-[var(--color-ink)]/50"}>{item.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{item.label}</span>
                              {item.sub && <span className="block truncate text-xs text-[var(--color-ink)]/55">{item.sub}</span>}
                            </span>
                            {item.badge && <span className="lunia-pill">{item.badge}</span>}
                            {selected && <kbd className="lunia-kbd hidden sm:inline-flex" aria-hidden="true">↵</kbd>}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}

                {items.length === 0 && !loading && (
                  <li role="presentation" className="px-6 py-10 text-center">
                    <p className="text-sm font-medium text-[var(--color-ink)]">No matches for “{q}”</p>
                    <p className="mt-1 text-xs text-[var(--color-ink)]/55">Try a customer name or phone, an invoice number, a product SKU or barcode, or a page name.</p>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        router.push(`/admin/search?q=${encodeURIComponent(q)}`);
                      }}
                      className="lunia-btn lunia-btn-forest-outline lunia-btn-sm mt-4"
                    >
                      Open full search
                    </button>
                  </li>
                )}
                {searching && loading && items.every((i) => i.section === "Actions" || i.section === "Pages") && (
                  <li role="presentation" className="px-4 py-2 text-xs text-[var(--color-ink)]/50">Searching records…</li>
                )}
                {noRecordHits && items.length > 0 && !loading && (
                  <li role="presentation" className="px-4 py-2 text-xs text-[var(--color-ink)]/50">No customers, bookings, invoices or products match — showing pages and actions.</li>
                )}
              </ul>

              <div className="flex items-center gap-4 border-t border-[var(--line)] px-4 py-2 text-[0.68rem] text-[var(--color-ink)]/50">
                <span className="inline-flex items-center gap-1"><kbd className="lunia-kbd">↑</kbd><kbd className="lunia-kbd">↓</kbd> navigate</span>
                <span className="inline-flex items-center gap-1"><kbd className="lunia-kbd">↵</kbd> open</span>
                <span className="ms-auto hidden sm:inline">Press <kbd className="lunia-kbd">?</kbd> for all shortcuts</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
