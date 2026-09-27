"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="lunia-btn lunia-btn-forest min-h-11">
      Print / save as PDF
    </button>
  );
}
