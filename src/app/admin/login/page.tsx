"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "./actions";

function MailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path strokeLinecap="round" d="m4 7 8 5 8-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path strokeLinecap="round" d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// Animated circular Lunia emblem: a faint static ring, a slowly rotating
// dashed accent ring, circular text turning the other way, and a centered
// "Lunia" wordmark whose letters fall in one after another (then float).
function LuniaEmblem() {
  const letters = "Lunia".split("");
  const teal = "color-mix(in srgb, var(--color-teal) 55%, transparent)";
  const cream = "color-mix(in srgb, var(--color-cream) 22%, transparent)";
  return (
    <div className="relative h-80 w-80 sm:h-[22rem] sm:w-[22rem]">
      <svg viewBox="0 0 240 240" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="120" cy="120" r="90" fill="none" style={{ stroke: cream }} strokeWidth="1" />
        <g className="lunia-ring-spin" style={{ transformBox: "fill-box" }}>
          <circle
            cx="120"
            cy="120"
            r="112"
            fill="none"
            style={{ stroke: teal }}
            strokeWidth="1.5"
            strokeDasharray="1.5 11"
            strokeLinecap="round"
          />
        </g>
        <g className="lunia-ring-spin-rev" style={{ transformBox: "fill-box" }}>
          <defs>
            <path id="lunia-emblem-path" d="M120,120 m-70,0 a70,70 0 1,1 140,0 a70,70 0 1,1 -140,0" />
          </defs>
          <text
            style={{ fill: "color-mix(in srgb, var(--color-cream) 55%, transparent)", letterSpacing: "3px" }}
            fontSize="8.5"
            fontFamily="Arial, Helvetica, sans-serif"
          >
            <textPath href="#lunia-emblem-path" startOffset="0" textLength={430} lengthAdjust="spacing">
              SKIN QUALITY CENTER    RIYADH    SKIN QUALITY CENTER    RIYADH
            </textPath>
          </text>
        </g>
      </svg>
      <div className="lunia-emblem-core absolute inset-0 flex items-center justify-center">
        <span className="font-[family-name:var(--font-display)] text-5xl tracking-[0.14em] text-[var(--color-cream)] sm:text-6xl">
          {letters.map((char, i) => (
            <span key={i} className="lunia-drop-char" style={{ animationDelay: `${0.35 + i * 0.13}s` }}>
              {char}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="lunia-btn lunia-btn-primary mt-2 w-full py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-[lunia-spin-slow_0.8s_linear_infinite] rounded-full border-2 border-[var(--color-ink)]/30 border-t-[var(--color-ink)]" />
          Signing in
        </>
      ) : (
        "Sign in"
      )}
    </button>
  );
}

const fieldWrap =
  "flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 transition-colors focus-within:border-[var(--color-teal)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-teal)_28%,transparent)]";
const fieldInput =
  "w-full bg-transparent py-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink)]/40 focus:outline-none";

export default function LoginPage() {
  const [state, action] = useActionState(login, null);

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="lunia-aurora lunia-grain relative hidden flex-col items-center justify-center gap-10 p-12 text-[var(--color-cream)] lg:flex">
        <LuniaEmblem />

        <p className="lunia-animate-fade-in lunia-delay-4 absolute bottom-8 left-1/2 -translate-x-1/2 text-xs tracking-wide text-[var(--color-cream)]/55">
          Riyadh, Saudi Arabia
        </p>
      </section>

      {/* Form panel */}
      <section className="relative flex items-center justify-center bg-[var(--color-page)] px-6 py-16">
        <div className="lunia-animate-fade-up w-full max-w-sm">
          {/* Compact brand lockup for small screens */}
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span className="font-[family-name:var(--font-display)] text-xl tracking-[0.3em] text-[var(--color-ink)]">
              LUNIA
            </span>
          </div>

          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)]">Welcome back</h2>
          <p className="mt-2 text-sm text-[var(--color-ink)]/60">Sign in to the Lunia management suite.</p>

          <form action={action} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-ink)]/60">Email</span>
              <span className={fieldWrap}>
                <span className="text-[var(--color-ink)]/45">
                  <MailIcon />
                </span>
                <input name="email" type="email" autoComplete="email" placeholder="you@lunia.com" className={fieldInput} required />
              </span>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-ink)]/60">Password</span>
              <span className={fieldWrap}>
                <span className="text-[var(--color-ink)]/45">
                  <LockIcon />
                </span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={fieldInput}
                  required
                />
              </span>
            </label>

            {state?.error && (
              <p
                role="alert"
                className="lunia-animate-fade-in rounded-[var(--radius-sm)] border border-red-300/60 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              >
                {state.error}
              </p>
            )}

            <SubmitButton />
          </form>

          <p className="mt-8 text-center text-xs text-[var(--color-ink)]/45">
            Protected area. Access is monitored and audited.
          </p>
        </div>
      </section>
    </main>
  );
}
