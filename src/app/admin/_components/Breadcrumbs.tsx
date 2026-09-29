"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PermissionKey } from "@/modules/iam/permissions";
import { deriveBreadcrumbs } from "./deriveBreadcrumbs";

interface BreadcrumbsProps {
  leafTitle: string;
  permissions: PermissionKey[];
  hiddenHrefs: string[];
}

export function Breadcrumbs({ leafTitle, permissions, hiddenHrefs }: BreadcrumbsProps) {
  const pathname = usePathname() ?? "/admin";
  const crumbs = deriveBreadcrumbs(pathname, leafTitle, new Set(permissions), hiddenHrefs);
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 -mt-2 overflow-x-auto">
      <ol className="flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--color-ink)]/55">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3 shrink-0 text-[var(--color-ink)]/30 rtl:-scale-x-100" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                </svg>
              )}
              {c.href && !last ? (
                <Link href={c.href} className="rounded px-0.5 transition-colors hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ring)]">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "max-w-[16rem] truncate font-medium text-[var(--color-ink)]/80" : ""}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
