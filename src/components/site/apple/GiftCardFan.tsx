import type { CSSProperties } from "react";

// A brand mark painted in currentColor via a CSS mask, so the mono SVGs can
// take any card's tone (an <img> would ignore currentColor).
function Mark({ src, className }: { src: string; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ${className}`}
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}

type Design = "teal" | "forest" | "cream" | "white" | "photo";

// Fan geometry, back to front: horizontal offset (% of card width), vertical
// drop, tilt and the entrance delay.
const FAN: { design: Design; tx: number; ty: string; r: number; d: number }[] = [
  { design: "cream", tx: -62, ty: "9%", r: -14, d: 0.35 },
  { design: "photo", tx: 62, ty: "9%", r: 14, d: 0.35 },
  { design: "forest", tx: -32, ty: "2%", r: -7, d: 0.2 },
  { design: "white", tx: 32, ty: "2%", r: 7, d: 0.2 },
  { design: "teal", tx: 0, ty: "0%", r: 0, d: 0.05 },
];

function Card({ design, label }: { design: Design; label: string }) {
  const base = "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[clamp(12px,1.4vw,20px)] p-[7%]";
  const footer = (tone: string) => (
    <div className={`flex items-end justify-between ${tone}`}>
      <Mark src="/brand/wordmark-mono.svg" className="h-[clamp(1rem,2.2vw,1.6rem)] w-[clamp(2.7rem,6vw,4.3rem)]" />
      <span className="text-[clamp(0.5rem,0.9vw,0.7rem)] font-semibold uppercase tracking-[0.2em] rtl:tracking-normal">{label}</span>
    </div>
  );
  switch (design) {
    case "teal":
      return (
        <div className={`${base} lunia-pattern-mosaic lunia-pattern-multiply bg-[var(--color-teal)]`}>
          <Mark src="/brand/emblem-mono.svg" className="h-[42%] w-[30%] self-center text-[var(--color-forest)]/85" />
          {footer("text-[var(--color-forest)]")}
        </div>
      );
    case "forest":
      return (
        <div className={`${base} lunia-pattern-waves lunia-pattern-on-dark bg-[var(--color-forest)]`}>
          <Mark src="/brand/glow.svg" className="h-[18%] w-[12%] text-[var(--color-teal)]" />
          {footer("text-[var(--color-teal)]")}
        </div>
      );
    case "cream":
      return (
        <div className={`${base} bg-[linear-gradient(135deg,#f6efe1,#e8d9b9)]`}>
          <Mark src="/brand/emblem-mono.svg" className="absolute -bottom-[18%] -right-[6%] h-[110%] w-[50%] text-[#b89a5e]/25 rtl:-left-[6%] rtl:right-auto" />
          <span />
          {footer("text-[#8c7243]")}
        </div>
      );
    case "white":
      return (
        <div className={`${base} bg-white ring-1 ring-inset ring-[var(--color-ink)]/[0.06]`}>
          <Mark src="/brand/wordmark-mono.svg" className="absolute right-[7%] top-[10%] h-[16%] w-[36%] text-[var(--color-teal)]" />
          <span />
          <div className="flex items-end justify-between text-[var(--color-ink)]/55">
            <Mark src="/brand/glow.svg" className="h-[clamp(0.8rem,1.4vw,1.1rem)] w-[clamp(0.8rem,1.4vw,1.1rem)] text-[var(--color-teal)]" />
            <span className="text-[clamp(0.5rem,0.9vw,0.7rem)] font-semibold uppercase tracking-[0.2em] rtl:tracking-normal">{label}</span>
          </div>
        </div>
      );
    case "photo":
      return (
        <div className={`${base} bg-[var(--color-ice)]`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
          <img src="/media/serum-macro.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-right" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
          <span />
          <div className="relative">{footer("text-white")}</div>
        </div>
      );
  }
}

// Apple's gift-card hero: a fan of card designs that springs open on load
// (the .lx-fan-card keyframes in globals.css) and lifts each card on hover.
export function GiftCardFan({ label }: { label: string }) {
  return (
    <div aria-hidden="true" className="relative mx-auto h-[clamp(11rem,34vw,24rem)] w-full max-w-6xl">
      {FAN.map((c) => (
        <div
          key={c.design}
          className="lx-fan-card absolute left-1/2 top-[8%] aspect-[1.586] w-[clamp(10rem,34vw,24rem)] rounded-[clamp(12px,1.4vw,20px)] shadow-[0_30px_60px_-30px_rgba(34,63,58,0.55)]"
          style={{ "--tx": `${c.tx}%`, "--ty": c.ty, "--r": `${c.r}deg`, "--d": `${c.d}s` } as CSSProperties}
        >
          <Card design={c.design} label={label} />
        </div>
      ))}
    </div>
  );
}
