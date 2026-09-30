"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { assistantOpen, assistantReset, assistantSend } from "./assistant/actions";
import type { ChatMessageView, ChatView, ChipView } from "@/modules/assistant/types";

interface AssistantWidgetProps {
  locale: string;
  /** Whether the WhatsApp button is shown (desktop stacks the launcher above it). */
  hasWhatsapp: boolean;
}

type Pending = { text: string } | null;

// The on-site consultation assistant. Everything conversational happens in
// server actions (src/modules/assistant/*); this component only renders the
// view it's given, sends taps/typed text back, and handles the sheet itself:
// a full-screen sheet on phones (safe areas, keyboard-aware height) and a
// floating panel on larger screens. The launcher sits at the physical
// bottom-right in both languages; the content inside is direction-aware.
export function AssistantWidget({ locale, hasWhatsapp }: AssistantWidgetProps) {
  const t = useTranslations("assistant");
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ChatView | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState("");

  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadedLocale = useRef<string | null>(null);

  // Load (or resume) the conversation the first time the panel opens.
  useEffect(() => {
    if (!open || loadedLocale.current === locale) return;
    loadedLocale.current = locale;
    let cancelled = false;
    setBusy(true);
    assistantOpen(locale)
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, locale]);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  // Escape closes; Tab stays inside the panel while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled])");
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Phones: lock the page behind the sheet and follow the visual viewport so
  // the input stays above the on-screen keyboard.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel || !window.matchMedia("(max-width: 767px)").matches) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const vv = window.visualViewport;
    const sync = () => {
      if (!vv) return;
      panel.style.height = `${vv.height}px`;
      panel.style.top = `${vv.offsetTop}px`;
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    return () => {
      document.body.style.overflow = prevOverflow;
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      panel.style.height = "";
      panel.style.top = "";
    };
  }, [open]);

  // Focus: the input on devices with a precise pointer (no surprise keyboard
  // on phones), otherwise the panel itself so screen readers land inside.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
      else panelRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [view, pending, busy, open]);

  const send = useCallback(
    async (input: { kind: "text"; text: string } | { kind: "choice"; value: string }, echo: string) => {
      if (busy) return;
      setError(false);
      setPending({ text: echo });
      setBusy(true);
      try {
        setView(await assistantSend(locale, input));
      } catch {
        setError(true);
      } finally {
        setPending(null);
        setBusy(false);
      }
    },
    [busy, locale],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send({ kind: "text", text }, text);
  };

  const onChip = (chip: ChipView) => void send({ kind: "choice", value: chip.value }, chip.label);

  const restart = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      setView(await assistantReset(locale));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const ui = view?.ui;
  const inputProps =
    ui?.input === "tel"
      ? { type: "tel", inputMode: "tel" as const, autoComplete: "tel", dir: "ltr" as const }
      : ui?.input === "code"
        ? { type: "text", inputMode: "numeric" as const, autoComplete: "one-time-code", dir: "ltr" as const }
        : ui?.input === "name"
          ? { type: "text", autoComplete: "name" }
          : { type: "text", autoComplete: "off" };

  // Launcher offsets: phones get one compact button (the WhatsApp FAB is
  // hidden there); desktop stacks it above the WhatsApp button.
  const launcherBottom = hasWhatsapp
    ? "bottom-[max(1.25rem,env(safe-area-inset-bottom))] md:bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+4.5rem)]"
    : "bottom-[max(1.25rem,env(safe-area-inset-bottom))]";
  const panelBottom = hasWhatsapp
    ? "md:bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+9rem)]"
    : "md:bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+4.5rem)]";

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? t("close") : t("open")}
        aria-expanded={open}
        aria-controls="lunia-assistant-panel"
        className={`lunia-teal-field fixed right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-[var(--shadow-glow)] ring-1 ring-[var(--color-cream)]/60 transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)] md:h-14 md:w-14 ${launcherBottom} ${open ? "max-md:hidden" : ""}`}
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6" aria-hidden="true">
            <path strokeLinejoin="round" d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9.5L5 20v-4h-.5A.5.5 0 0 1 4 15.5v-10Z" />
            <path strokeLinecap="round" d="M8.5 9h7M8.5 12h4.5" />
          </svg>
        )}
      </button>

      {open && (
        <div
          id="lunia-assistant-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
          tabIndex={-1}
          dir={ar ? "rtl" : "ltr"}
          className={`lunia-animate-scale-in fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-[var(--surface)] outline-none md:inset-x-auto md:top-auto md:right-5 md:h-[min(40rem,calc(100dvh-12rem))] md:w-[24.5rem] md:rounded-[var(--radius-lg)] md:border md:border-[var(--line)] md:shadow-[var(--shadow-lg)] ${panelBottom}`}
        >
          <header className="flex items-center gap-3 lunia-teal-field px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-teal)]/20">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-teal)] shadow-[0_0_12px_var(--color-teal)]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-[family-name:var(--font-display)] text-lg leading-tight">{t("title")}</h2>
              <p className="truncate text-xs text-[var(--color-ink)]/75">{t("subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={restart}
              disabled={busy}
              aria-label={t("restart")}
              title={t("restart")}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)]/75 transition-colors hover:bg-[var(--color-cream)]/35 hover:text-[var(--color-ink)] disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={close}
              aria-label={t("close")}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)]/75 transition-colors hover:bg-[var(--color-cream)]/35 hover:text-[var(--color-ink)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label={t("conversation")}
            className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[var(--color-page)] px-4 py-4"
          >
            {view?.messages.map((m) => <Message key={m.id} message={m} />)}
            {pending && (
              <div className="flex justify-end">
                <div className="lunia-teal-field max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-ee-md px-3.5 py-2.5 text-[0.94rem] leading-relaxed">
                  {pending.text}
                </div>
              </div>
            )}
            {busy && <Typing label={t("typing")} />}
            {error && (
              <p role="alert" className="lx-notice lx-notice-error text-center">
                {t("offline")}
              </p>
            )}
          </div>

          {ui && ui.chips.length > 0 && (
            <div role="group" aria-label={t("quickReplies")} className="max-h-[34%] shrink-0 overflow-y-auto border-t border-[var(--line)] bg-[var(--surface)] px-3 pt-3">
              <div className="flex flex-wrap gap-2 pb-1">
                {ui.chips.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    disabled={busy}
                    onClick={() => onChip(chip)}
                    className={`min-h-10 rounded-full px-3.5 py-2 text-sm leading-tight transition-colors disabled:opacity-50 ${
                      chip.tone === "primary"
                        ? "bg-[var(--color-ink)] text-[var(--color-on-ink)] hover:bg-[var(--color-teal-ink)]"
                        : "border border-[var(--color-teal-ink)]/25 bg-[var(--color-mist)] text-[var(--color-teal-ink)] hover:bg-[var(--color-ice)]"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={onSubmit}
            className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
          >
            <label htmlFor="lunia-assistant-input" className="sr-only">
              {t("inputLabel")}
            </label>
            <input
              id="lunia-assistant-input"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={ui?.placeholder ?? ""}
              maxLength={600}
              enterKeyHint="send"
              {...inputProps}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-[var(--line-strong)] bg-[var(--color-page)] px-4 text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink)]/55 focus:border-[var(--color-canopy)] focus:outline-none focus:ring-2 focus:ring-[var(--color-teal)]/50"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label={t("send")}
              className="lunia-teal-field flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-5 w-5 ${ar ? "-scale-x-100" : ""}`} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
          <p className="shrink-0 bg-[var(--surface)] px-4 pb-2 text-center text-[0.7rem] text-[var(--color-ink)]/75 max-md:hidden">{t("privacy")}</p>
        </div>
      )}
    </>
  );
}

function Message({ message }: { message: ChatMessageView }) {
  if (message.from === "user") {
    return (
      <div className="flex justify-end">
        <div className="lunia-teal-field max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-ee-md px-3.5 py-2.5 text-[0.94rem] leading-relaxed">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="max-w-[88%] whitespace-pre-line break-words rounded-2xl rounded-ss-md bg-[var(--surface)] px-3.5 py-2.5 text-[0.94rem] leading-relaxed text-[var(--color-ink)] shadow-[var(--shadow-sm)]">
        {message.text}
      </div>
      {message.cards && message.cards.length > 0 && (
        <ul className="flex w-full flex-col gap-2">
          {message.cards.map((card) => (
            <li key={card.serviceId} className="lx-surface rounded-2xl border border-[var(--color-teal)]/45 p-3.5">
              <p className="font-[family-name:var(--font-display)] text-[1.05rem] leading-snug text-[var(--color-ink)]">{card.name}</p>
              <p className="mt-0.5 text-xs text-[var(--color-teal-ink)]">
                {card.duration} <span aria-hidden="true">|</span> {card.price}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink)]/75">{card.why}</p>
              {card.note && <p className="mt-1.5 text-xs font-medium text-[var(--color-teal-ink)]">{card.note}</p>}
            </li>
          ))}
        </ul>
      )}
      {message.summary && (
        <div className="w-full rounded-2xl border border-[var(--color-teal)]/45 bg-[var(--color-ice)]/35 p-3.5 text-sm">
          <p className="mb-2 font-[family-name:var(--font-display)] text-base text-[var(--color-ink)]">{message.summary.title}</p>
          <dl>
            {message.summary.rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3 py-0.5">
                <dt className="text-[var(--color-ink)]/75">{row.label}</dt>
                <dd className="text-end font-medium text-[var(--color-ink)]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {message.links && message.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="inline-flex min-h-10 items-center rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-on-ink)] transition-colors hover:bg-[var(--color-teal-ink)]"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-ss-md bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)]">
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-canopy)]"
            style={{ animation: `lunia-twinkle 1.2s ease-in-out ${i * 0.18}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}
