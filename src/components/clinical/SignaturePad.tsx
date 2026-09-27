"use client";

import { useCallback, useEffect, useRef } from "react";

interface SignaturePadProps {
  /** Called with a PNG data URL after each stroke, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  clearLabel: string;
  hint?: string;
  /** CSS height of the drawing area in px. */
  height?: number;
  ariaLabel: string;
}

// Exported images are capped at this width so a signature drawn on a large
// high-DPI iPad canvas stays a few dozen KB.
const EXPORT_MAX_WIDTH = 900;

// A drawn signature: pointer events (finger, Apple Pencil, mouse), with
// pressure-aware width for pens. touch-action: none stops the page from
// scrolling while signing on a tablet.
export function SignaturePad({ onChange, clearLabel, hint, height = 220, ariaLabel }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  // Ref (not state) so pointerup in the same stroke sees the ink immediately.
  const hasInk = useRef(false);
  // Held in a ref so an inline onChange from the parent doesn't re-run the
  // sizing effect (which would wipe the drawing) on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Size the backing store to the element's CSS size x devicePixelRatio.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16302d";
    // A resize wipes the bitmap; reflect that.
    hasInk.current = false;
    onChangeRef.current(null);
  }, []);

  useEffect(() => {
    resize();
    // Only re-size on real width changes (iOS fires resize on scroll when the
    // toolbar collapses, which would otherwise wipe a signature mid-way).
    let lastWidth = canvasRef.current?.getBoundingClientRect().width ?? 0;
    const onResize = () => {
      const w = canvasRef.current?.getBoundingClientRect().width ?? 0;
      if (Math.abs(w - lastWidth) > 1) {
        lastWidth = w;
        resize();
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resize]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function exportPng(): string | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const scale = Math.min(1, EXPORT_MAX_WIDTH / canvas.width);
    if (scale === 1) return canvas.toDataURL("image/png");
    const out = document.createElement("canvas");
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    out.getContext("2d")?.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    ctx.lineWidth = 1.4 + pressure * 2.4;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasInk.current = true;
  }

  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (hasInk.current) onChangeRef.current(exportPng());
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    hasInk.current = false;
    onChangeRef.current(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-[var(--radius-sm,0.75rem)] border-2 border-dashed border-[var(--color-ink)]/25 bg-white">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel}
          style={{ height, touchAction: "none" }}
          className="block w-full cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {/* Baseline to sign on */}
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-[var(--color-ink)]/20" />
      </div>
      <div className="flex items-center justify-between gap-3">
        {hint ? <p className="text-xs text-[var(--color-ink)]/55">{hint}</p> : <span />}
        <button
          type="button"
          onClick={clear}
          className="min-h-11 rounded-full border border-[var(--color-ink)]/20 px-5 text-sm font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/5"
        >
          {clearLabel}
        </button>
      </div>
    </div>
  );
}
