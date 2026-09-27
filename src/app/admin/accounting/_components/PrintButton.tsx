"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="lunia-btn lunia-btn-ghost min-h-11">
      Print
    </button>
  );
}
