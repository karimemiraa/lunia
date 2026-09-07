import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" };

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const base = "inline-flex items-center justify-center px-6 py-3 font-medium tracking-wide transition-colors";
  const styles = variant === "primary"
    ? "bg-[var(--color-teal)] text-[var(--color-ink)] hover:bg-[var(--color-canopy)]"
    : "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-cream)]";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
