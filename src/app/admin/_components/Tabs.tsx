"use client";

import { useState, type ReactNode } from "react";

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
  /** Optional count/badge shown next to the label. */
  badge?: number;
}

// A lightweight tab switcher. All panels are rendered up front and toggled with
// `hidden`, so panel state (forms, inputs) is preserved when switching and the
// server-rendered content inside each panel needs no client refetch.
export function Tabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-[var(--line)]">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(tab.id)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? "border-[var(--color-teal)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink)]/55 hover:text-[var(--color-ink)]"
              }`}
            >
              {tab.label}
              {typeof tab.badge === "number" && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${
                    selected ? "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]" : "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/55"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" hidden={tab.id !== active}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
