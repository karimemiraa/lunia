"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "./_components/EmptyState";

// Route-level error boundary for the staff system. `retry` re-renders the
// segment (a transient DB/network blip usually clears); the digest helps
// support find the server log line.
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="lunia-admin-bg flex min-h-screen items-center justify-center p-6">
      <div className="lunia-card w-full max-w-md">
        <div className="flex justify-center pt-8">
          <span className="lunia-logo-stage !px-4 !py-2"><span role="img" aria-label="LUNIA" className="lunia-logo h-5" /></span>
        </div>
        <EmptyState
          title="Something went wrong"
          body="This page hit an unexpected error. Your data is safe — try again, or go back to the dashboard."
          icon={<path d="M12 8v5M12 16.5v.5M12 3l9.5 17h-19L12 3Z" />}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => retry()} className="lunia-btn lunia-btn-forest lunia-btn-sm">
                Try again
              </button>
              <Link href="/admin" className="lunia-btn lunia-btn-ghost lunia-btn-sm">
                Go to dashboard
              </Link>
            </div>
          }
        />
        {error.digest && <p className="pb-6 text-center text-[0.65rem] text-[var(--color-ink)]/40">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
