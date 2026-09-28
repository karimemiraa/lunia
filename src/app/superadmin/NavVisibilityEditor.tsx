"use client";

import { useState, useTransition } from "react";
import { saveNavVisibilityAction } from "./actions";

interface Props {
  catalog: { label: string; items: { href: string; label: string }[] }[];
  hidden: string[];
}

// Lets the superadmin hide menu items from the rest of the staff. It's a
// visibility control, not a permission: pages stay reachable by URL for
// anyone whose role allows them, so use Roles for security and this for
// keeping the menu tidy (e.g. hiding Payroll or Accounting from reception).
export function NavVisibilityEditor({ catalog, hidden }: Props) {
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(new Set(hidden));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(href: string) {
    setHiddenSet((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
    setDirty(true);
    setMsg(null);
  }

  function toggleGroup(items: { href: string }[], hide: boolean) {
    setHiddenSet((prev) => {
      const next = new Set(prev);
      for (const i of items) {
        if (hide) next.add(i.href);
        else next.delete(i.href);
      }
      return next;
    });
    setDirty(true);
    setMsg(null);
  }

  function save() {
    startTransition(async () => {
      const r = await saveNavVisibilityAction(Array.from(hiddenSet));
      setMsg(r.error ?? "Saved. Staff will see the new menu on their next page load.");
      if (!r.error) setDirty(false);
    });
  }

  const hiddenCount = hiddenSet.size;

  return (
    <section className="lunia-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">Staff menu</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink)]/60">
            Untick anything the team shouldn't see in the sidebar. You always see the full menu. This tidies the menu;
            access itself is still decided by each user's role.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-ink)]/55">{hiddenCount === 0 ? "Everything visible" : `${hiddenCount} hidden`}</span>
          <button type="button" onClick={save} disabled={!dirty || pending} className="lunia-btn lunia-btn-forest lunia-btn-sm disabled:opacity-50">
            {pending ? "Saving…" : "Save menu"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((group) => {
          const allHidden = group.items.every((i) => hiddenSet.has(i.href));
          return (
            <fieldset key={group.label} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
              <legend className="flex items-center gap-2 px-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-teal-ink)]">
                {group.label}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.items, !allHidden)}
                  className="rounded px-1 text-[0.65rem] font-medium normal-case tracking-normal text-[var(--color-ink)]/50 hover:text-[var(--color-ink)]"
                >
                  {allHidden ? "show all" : "hide all"}
                </button>
              </legend>
              <ul className="mt-1 flex flex-col">
                {group.items.map((item) => {
                  const visible = !hiddenSet.has(item.href);
                  return (
                    <li key={item.href}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-1 text-sm text-[var(--color-ink)] hover:bg-[var(--color-ink)]/[0.03]">
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={() => toggle(item.href)}
                          className="h-4 w-4 accent-[var(--color-teal-ink)]"
                        />
                        <span className={visible ? "" : "text-[var(--color-ink)]/45 line-through"}>{item.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-3 min-h-[1.25rem] text-xs text-[var(--color-ink)]/60">{msg}</p>
    </section>
  );
}
