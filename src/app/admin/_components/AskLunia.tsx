"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { askAssistantAction, createEditRequestAction } from "./assistant.actions";
import { useIsClient } from "./useIsClient";
import { st, type StaffLocale } from "../_i18n/staffLocale";
import type { AssistantReply, ChatTurn } from "@/modules/staffAssistant/types";

// "Ask Lunia" — the team's in-app help center. A floating button opens a chat
// that can take staff to any page (or a pre-filled form), explain how to do a
// task step by step, show live numbers, and file an edit request for the
// owners. All answers come from the server (askAssistantAction), which checks
// the staff member's permissions; this component only renders and navigates.

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  reply?: AssistantReply;
}

interface Draft {
  title: string;
  details: string;
  priority: "LOW" | "NORMAL" | "HIGH";
}

const HISTORY_KEY = "lunia_ask_history";
const OPEN_KEY = "lunia_ask_open";
const MAX_STORED = 40;
const STARTERS = ["What needs my attention?", "Revenue today", "How do I issue a refund?", "Open the calendar"];
const STARTERS_AR = ["ماذا ينتظرني؟", "إيرادات اليوم", "كيف أصدر استرداد؟", "افتح التقويم"];

// Storage can be blocked (private mode, policies) — the chat must still work.
function load<T>(storage: "local" | "session", key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(storage: "local" | "session", key: string, value: unknown) {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function AskLunia({ locale, aiEnabled }: { locale: StaffLocale; aiEnabled: boolean }) {
  const t = (s: string) => st(s, locale);
  const isClient = useIsClient();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean>(() => load("session", OPEN_KEY, false));
  const [messages, setMessages] = useState<Message[]>(() => load<Message[]>("local", HISTORY_KEY, []));
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => save("local", HISTORY_KEY, messages.slice(-MAX_STORED)), [messages]);
  useEffect(() => save("session", OPEN_KEY, open), [open]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, draft, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function go(href: string) {
    // Small screens: the panel covers the page, so close it when navigating.
    if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
    router.push(href);
  }

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    const history: ChatTurn[] = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { id: newId(), role: "user", text: q }]);
    setInput("");
    startTransition(async () => {
      let reply: AssistantReply;
      try {
        reply = await askAssistantAction(q, history);
      } catch {
        reply = { text: t("I couldn't reach the server. Check your connection and try again."), source: "rules" };
      }
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: reply.text, reply }]);
      if (reply.requestDraft) setDraft({ title: reply.requestDraft.title ?? "", details: reply.requestDraft.details ?? "", priority: "NORMAL" });
      if (reply.navigateTo) go(reply.navigateTo);
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  function submitDraft(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setDraftError(null);
    startSending(async () => {
      const res = await createEditRequestAction({ ...draft, pagePath: pathname });
      if (res.success) {
        setDraft(null);
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", text: `${t("Request sent — the owners will review it.")} “${draft.title}”`, reply: { text: "", source: "rules", suggestions: ["My requests"] } },
        ]);
      } else {
        setDraftError(res.error ?? t("Couldn't send the request."));
      }
    });
  }

  // Hidden on the sign-in screen (the layout can outlive a client-side sign-out).
  if (!isClient || pathname.startsWith("/admin/login")) return null;

  const starters = locale === "ar" ? STARTERS_AR : STARTERS;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="ask-lunia-panel"
        dir={locale === "ar" ? "rtl" : "ltr"}
        aria-label={open ? t("Close the assistant") : t("Open the team assistant")}
        data-testid="ask-lunia-trigger"
        className="fixed bottom-5 end-5 z-40 flex h-12 items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 text-sm font-medium text-[var(--color-on-ink)] shadow-lg transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-teal)] print:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 5h16v11H9l-5 4V5zM8 9.5h8M8 12.5h5" />}
        </svg>
        <span className="hidden sm:inline">{t("Ask Lunia")}</span>
      </button>

      {open && (
        <section
          id="ask-lunia-panel"
          role="dialog"
          aria-label={t("Team assistant")}
          dir={locale === "ar" ? "rtl" : "ltr"}
          data-testid="ask-lunia-panel"
          className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:inset-x-auto sm:bottom-20 sm:end-5 sm:top-auto sm:h-[min(640px,calc(100vh-7rem))] sm:w-[400px] sm:rounded-2xl print:hidden"
        >
          <header className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{t("Ask Lunia")}</p>
              <p className="text-xs text-[var(--color-ink)]/60">{t("Team assistant")}</p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button type="button" onClick={() => setMessages([])} className="lunia-btn lunia-btn-ghost lunia-btn-sm" data-testid="ask-lunia-clear">
                  {t("Clear chat")}
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Close the assistant")} className="lunia-btn lunia-btn-ghost lunia-btn-sm">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite" data-testid="ask-lunia-messages">
            {messages.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="rounded-xl bg-[var(--color-ink)]/[0.05] px-3 py-2.5 text-sm">
                  {t("Hi! I can take you to any page, explain how to do something, give you live numbers, or send an edit request to the owners.")}
                </p>
                <Chips items={starters} onPick={ask} />
              </div>
            )}
            {messages.map((m) => (
              <MessageView key={m.id} message={m} onLink={go} onAsk={ask} t={t} />
            ))}
            {pending && (
              <p className="self-start rounded-xl bg-[var(--color-ink)]/[0.05] px-3 py-2 text-sm text-[var(--color-ink)]/60" data-testid="ask-lunia-thinking">
                {t("Thinking…")}
              </p>
            )}
            {draft && (
              <form onSubmit={submitDraft} className="flex flex-col gap-2 rounded-xl border border-[var(--line)] p-3" data-testid="ask-lunia-request-form">
                <p className="text-sm font-semibold">{t("Request an edit")}</p>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-ink)]/60">{t("Short title")}</span>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    required
                    minLength={3}
                    maxLength={140}
                    dir="auto"
                    className="lunia-input text-sm"
                    name="title"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-ink)]/60">{t("What should change?")}</span>
                  <textarea
                    value={draft.details}
                    onChange={(e) => setDraft({ ...draft, details: e.target.value })}
                    required
                    minLength={5}
                    maxLength={4000}
                    rows={3}
                    dir="auto"
                    className="lunia-input text-sm"
                    name="details"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-ink)]/60">{t("Priority")}</span>
                  <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Draft["priority"] })} className="lunia-input text-sm" name="priority">
                    <option value="LOW">{t("Low")}</option>
                    <option value="NORMAL">{t("Normal")}</option>
                    <option value="HIGH">{t("High")}</option>
                  </select>
                </label>
                {draftError && (
                  <p role="alert" className="text-xs text-[var(--color-danger)]">
                    {draftError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="submit" disabled={sending} className="lunia-btn lunia-btn-forest lunia-btn-sm" data-testid="ask-lunia-request-send">
                    {t("Send request")}
                  </button>
                  <button type="button" onClick={() => setDraft(null)} className="lunia-btn lunia-btn-ghost lunia-btn-sm">
                    {t("Cancel")}
                  </button>
                </div>
              </form>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-[var(--line)] px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                rows={1}
                maxLength={1000}
                dir="auto"
                placeholder={t("Ask a question…")}
                aria-label={t("Ask about a page, a task or a number…")}
                className="lunia-input max-h-28 min-h-11 flex-1 resize-none text-sm"
                data-testid="ask-lunia-input"
              />
              <button type="submit" disabled={pending || !input.trim()} className="lunia-btn lunia-btn-forest min-h-11" data-testid="ask-lunia-send">
                {t("Send")}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDraft((d) => d ?? { title: "", details: "", priority: "NORMAL" })}
                className="text-xs font-medium text-[var(--color-teal-ink)] underline underline-offset-2"
                data-testid="ask-lunia-request-open"
              >
                {t("Request an edit")}
              </button>
              {aiEnabled && <span className="text-[11px] text-[var(--color-ink)]/50">Claude</span>}
            </div>
          </form>
        </section>
      )}
    </>
  );
}

function Chips({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          dir="auto"
          className="rounded-full border border-[var(--line)] px-3 py-1 text-xs hover:bg-[var(--color-ink)]/[0.05]"
          data-testid="ask-lunia-suggestion"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function MessageView({ message, onLink, onAsk, t }: { message: Message; onLink: (href: string) => void; onAsk: (q: string) => void; t: (s: string) => string }) {
  if (message.role === "user") {
    return (
      <p dir="auto" className="max-w-[85%] self-end whitespace-pre-wrap rounded-xl bg-[var(--color-ink)] px-3 py-2 text-sm text-[var(--color-on-ink)]" data-testid="ask-lunia-user-message">
        {message.text}
      </p>
    );
  }
  const r = message.reply;
  return (
    <div className="flex max-w-[92%] flex-col gap-2 self-start" data-testid="ask-lunia-message">
      {message.text && (
        <p dir="auto" className="whitespace-pre-wrap rounded-xl bg-[var(--color-ink)]/[0.05] px-3 py-2 text-sm">
          {message.text}
        </p>
      )}
      {r?.stats && r.stats.length > 0 && (
        <dl dir="auto" className="grid grid-cols-2 gap-1.5" data-testid="ask-lunia-stats">
          {r.stats.map((s, i) => (
            <div key={`${s.label}-${i}`} className="rounded-lg border border-[var(--line)] px-2.5 py-1.5">
              <dt dir="auto" className="truncate text-[11px] text-[var(--color-ink)]/60" title={s.label}>
                {s.label}
              </dt>
              <dd dir="auto" className="text-sm font-semibold tabular-nums">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {r?.guide && (
        // dir="auto": guide text is English, so it stays LTR even inside the Arabic (RTL) panel.
        <ol dir="auto" className="flex list-decimal flex-col gap-1 rounded-xl border border-[var(--line)] py-2.5 pe-3 ps-7 text-sm" data-testid="ask-lunia-guide">
          {r.guide.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
      {r?.links && r.links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.links.map((l) => (
            <button
              key={l.href}
              type="button"
              onClick={() => onLink(l.href)}
              className={`lunia-btn lunia-btn-sm ${l.kind === "form" ? "lunia-btn-forest" : "lunia-btn-forest-outline"}`}
              data-testid="ask-lunia-link"
              data-href={l.href}
            >
              {l.label}
              <span aria-hidden="true" className="rtl:rotate-180">
                →
              </span>
            </button>
          ))}
        </div>
      )}
      {r?.suggestions && r.suggestions.length > 0 && <Chips items={r.suggestions} onPick={onAsk} />}
      {r?.source === "ai" && <span className="text-[11px] text-[var(--color-ink)]/45">{t("Answered by Claude")}</span>}
    </div>
  );
}
