"use client";

export function PrintButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className ?? "lunia-btn lunia-btn-forest min-h-[44px]"}>
      {label}
    </button>
  );
}
