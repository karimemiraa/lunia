import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "ink";
  size?: "sm" | "md";
};

// Shared admin button. Styling lives in globals.css (.lunia-btn*) so every
// button across the suite stays consistent and premium.
export function Button({ variant = "primary", size = "md", className = "", ...props }: Props) {
  const variantClass =
    variant === "ghost" ? "lunia-btn-ghost" : variant === "ink" ? "lunia-btn-ink" : "lunia-btn-primary";
  const sizeClass = size === "sm" ? "px-3.5 py-1.5 text-xs" : "";
  return <button className={`lunia-btn ${variantClass} ${sizeClass} ${className}`.trim()} {...props} />;
}
