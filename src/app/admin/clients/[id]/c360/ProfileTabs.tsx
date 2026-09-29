"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Dispatch on window to switch the profile tab from elsewhere (quick actions). */
export const SELECT_TAB_EVENT = "lunia:select-profile-tab";

export interface ProfileTabDef {
  id: string;
  label: string;
  content: ReactNode;
  badge?: number;
}

// Profile tabs with a URL-addressable initial tab (?tab=notes) so timeline
// rows and next-best-action links can land on a specific panel. All panels
// are rendered up front (like the shared Tabs) so form state survives
// switching; the active tab is mirrored into the URL without a navigation.
export function ProfileTabs({ tabs, initialTab }: { tabs: ProfileTabDef[]; initialTab?: string }) {
  const [active, setActive] = useState(() => (initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : tabs[0]?.id));

  useEffect(() => {
    const onSelect = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (tabs.some((t) => t.id === id)) select(id);
    };
    window.addEventListener(SELECT_TAB_EVENT, onSelect);
    return () => window.removeEventListener(SELECT_TAB_EVENT, onSelect);
  }, [tabs]);

  function select(id: string) {
    setActive(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // Non-browser or restricted context: tab state stays in memory only.
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((t) => t.id === active);
    if (idx < 0) return;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(tabs[next]!.id);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next] as HTMLButtonElement | undefined)?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Customer sections" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-[var(--line)]">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              className={`-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${
                selected ? "border-[var(--color-teal)] text-[var(--color-ink)]" : "border-transparent text-[var(--color-ink)]/55 hover:text-[var(--color-ink)]"
              }`}
            >
              {tab.label}
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${selected ? "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]" : "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/55"}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={`panel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} hidden={tab.id !== active}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
