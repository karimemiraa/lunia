"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import "./tokens.css";

export interface MenuItem {
  label: ReactNode;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Set when the item opens a new tab (print views). */
  external?: boolean;
}

interface RowMenuProps {
  items: MenuItem[];
  label?: string;
  /** Compact icon trigger (default) or a labelled button. */
  triggerLabel?: ReactNode;
  className?: string;
}

/**
 * Overflow ("kebab") menu for row actions: keyboard-operable (arrows, Home/
 * End, Escape, Enter), rendered in a portal so table overflow never clips it.
 */
export function RowMenu({ items, label = "Row actions", triggerLabel, className = "" }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; alignEnd: boolean }>({ top: 0, left: 0, alignEnd: false });
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const enabled = items.filter((i) => !i.disabled);

  function place() {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const alignEnd = r.left > window.innerWidth / 2;
    setPos({ top: r.bottom + 6, left: alignEnd ? r.right : r.left, alignEnd });
  }

  function toggle() {
    if (!open) {
      place();
      setActive(0);
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const t = setTimeout(() => menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[0]?.focus(), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function focusItem(i: number) {
    const nodes = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const n = nodes?.length ?? 0;
    if (!n) return;
    const idx = ((i % n) + n) % n;
    setActive(idx);
    nodes![idx]!.focus();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusItem(active + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem(active - 1);
        break;
      case "Home":
        e.preventDefault();
        focusItem(0);
        break;
      case "End":
        e.preventDefault();
        focusItem(enabled.length - 1);
        break;
      case "Escape":
      case "Tab":
        e.preventDefault();
        setOpen(false);
        btn.current?.focus();
        break;
    }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={triggerLabel ? undefined : label}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            toggle();
          }
        }}
        className={
          triggerLabel
            ? `lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 ${className}`
            : `inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)]/60 transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${className}`
        }
      >
        {triggerLabel ?? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            style={{ top: pos.top, left: pos.alignEnd ? undefined : pos.left, right: pos.alignEnd ? window.innerWidth - pos.left : undefined }}
            className="lx-menu fixed z-[60] min-w-44 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)]"
          >
            {enabled.map((item, i) => {
              const cls = `flex min-h-11 w-full items-center px-4 text-start text-sm transition-colors focus:outline-none focus:bg-[var(--surface-2)] hover:bg-[var(--surface-2)] ${
                item.danger ? "text-[var(--status-danger-ink)]" : "text-[var(--color-ink)]"
              }`;
              const common = {
                role: "menuitem" as const,
                tabIndex: i === active ? 0 : -1,
                onFocus: () => setActive(i),
                onClick: () => {
                  setOpen(false);
                  item.onSelect?.();
                },
              };
              return item.href ? (
                <Link key={i} href={item.href} target={item.external ? "_blank" : undefined} className={cls} {...common}>
                  {item.label}
                </Link>
              ) : (
                <button key={i} type="button" className={cls} {...common}>
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
