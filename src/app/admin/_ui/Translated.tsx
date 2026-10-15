"use client";

// Small client helpers so server-safe primitives (FilterBar, Pagination, …)
// can translate attributes and <option> text, which <Tr> can't reach.
import type { InputHTMLAttributes, ReactNode } from "react";
import { useStaffT } from "../_i18n/StaffI18n";

/** <option> whose label goes through the staff dictionary. */
export function TOption({ value, label }: { value: string; label: string }) {
  return <option value={value}>{useStaffT()(label)}</option>;
}

/** A <nav>, <ol> or <div> with a translated aria-label. */
export function TLabelled({ as = "div", label, className, children }: { as?: "div" | "nav" | "ol"; label: string; className?: string; children: ReactNode }) {
  const t = useStaffT();
  const Tag = as;
  return (
    <Tag aria-label={t(label)} className={className}>
      {children}
    </Tag>
  );
}

/** An <input> whose placeholder goes through the staff dictionary. */
export function TInput({ placeholder, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const t = useStaffT();
  return <input {...rest} placeholder={placeholder && t(placeholder)} />;
}
