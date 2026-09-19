"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ServiceOption {
  slug: string;
  name: string;
}
interface AssistantWidgetProps {
  locale: string;
  services: ServiceOption[];
  whatsappHref: string | null;
  bookHref: string;
}

type Msg = { from: "bot" | "user"; text: string };

// A lightweight, bilingual on-site assistant that guides visitors to a booking.
// Rule-based (no external LLM key needed) — it greets, offers quick choices,
// lets you pick a service, then hands off to the booking wizard prefilled with
// that service. Native Arabic first, English second.
export function AssistantWidget({ locale, services, whatsappHref, bookHref }: AssistantWidgetProps) {
  const ar = locale === "ar";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "services">("menu");
  const [messages, setMessages] = useState<Msg[]>([
    { from: "bot", text: ar ? "هلا وغلا في لونيا 🌿 أنا مساعدتك، أقدر أساعدك تحجزين موعدك. وش تحبين؟" : "Hi and welcome to Lunia 🌿 I'm your assistant — I can help you book. What would you like?" },
  ]);

  const say = (text: string, from: Msg["from"] = "bot") => setMessages((m) => [...m, { from, text }]);

  const t = ar
    ? { book: "أبغى أحجز موعد", prices: "الأسعار", hours: "الأوقات والموقع", whatsapp: "أكلمكم واتساب", pickService: "زين! أي خدمة تحبين؟", pricesMsg: "تختلف الأسعار حسب الخدمة، وتقدرين تشوفينها كاملة وتحجزين من صفحة الحجز 👇", hoursMsg: "نفتح يومياً من ١٠ صباحاً حتى ١٠ مساءً (الجمعة مغلق)، في طريق الملك فهد، الرياض.", openBooking: "افتحي صفحة الحجز", back: "رجوع", placeholder: "اكتبي رسالتك…", title: "مساعدة لونيا" }
    : { book: "I want to book", prices: "Prices", hours: "Hours & location", whatsapp: "Chat on WhatsApp", pickService: "Great! Which service would you like?", pricesMsg: "Prices vary by service — you can see them all and book from the booking page 👇", hoursMsg: "We're open daily 10am–10pm (closed Friday), on King Fahd Road, Riyadh.", openBooking: "Open the booking page", back: "Back", placeholder: "Type a message…", title: "Lunia Assistant" };

  function pickService(s: ServiceOption) {
    say(s.name, "user");
    say(ar ? `ممتاز، بحوّلك لصفحة الحجز لـ«${s.name}» تختارين الوقت المناسب.` : `Perfect — taking you to booking for "${s.name}" to pick a time.`);
    setTimeout(() => router.push(`${bookHref}?service=${s.slug}`), 700);
  }

  function choose(kind: "book" | "prices" | "hours" | "whatsapp") {
    if (kind === "book") {
      say(t.book, "user");
      say(t.pickService);
      setView("services");
    } else if (kind === "prices") {
      say(t.prices, "user");
      say(t.pricesMsg);
    } else if (kind === "hours") {
      say(t.hours, "user");
      say(t.hoursMsg);
    } else if (kind === "whatsapp" && whatsappHref) {
      window.open(whatsappHref, "_blank");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.title}
        className="fixed z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-forest)] text-[var(--color-cream)] shadow-[var(--shadow-lg)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2"
        style={{ insetInlineStart: "1.25rem", bottom: "5.5rem" }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6" aria-hidden="true">
          <path strokeLinejoin="round" d="M4 5h16v11H9l-5 4V5Z" />
          <path strokeLinecap="round" d="M8 9.5h8M8 12.5h5" />
        </svg>
      </button>

      {open && (
        <div
          dir={ar ? "rtl" : "ltr"}
          className="fixed z-50 flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
          style={{ insetInlineStart: "1.25rem", bottom: "12rem" }}
        >
          <div className="flex items-center justify-between gap-2 bg-[var(--color-forest)] px-4 py-3 text-[var(--color-cream)]">
            <span className="font-[family-name:var(--font-display)] text-lg">{t.title}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1 text-[var(--color-cream)]/70 hover:bg-white/10 hover:text-[var(--color-cream)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === "user" ? "bg-[var(--color-teal)]/25 text-[var(--color-ink)]" : "bg-[var(--surface-2)] text-[var(--color-ink)]"}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] p-3">
            {view === "menu" ? (
              <>
                <Qr onClick={() => choose("book")}>{t.book}</Qr>
                <Qr onClick={() => choose("prices")}>{t.prices}</Qr>
                <Qr onClick={() => choose("hours")}>{t.hours}</Qr>
                {whatsappHref && <Qr onClick={() => choose("whatsapp")}>{t.whatsapp}</Qr>}
              </>
            ) : (
              <>
                {services.slice(0, 8).map((s) => (
                  <Qr key={s.slug} onClick={() => pickService(s)}>{s.name}</Qr>
                ))}
                <Qr onClick={() => setView("menu")}>{t.back}</Qr>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Qr({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[var(--color-forest)]/30 bg-[var(--color-forest)]/5 px-3 py-1.5 text-sm text-[var(--color-forest)] transition-colors hover:bg-[var(--color-forest)]/12"
    >
      {children}
    </button>
  );
}
