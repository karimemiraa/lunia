// "View as customer" (owner/admins only; see modules/iam/impersonation.ts).
// A plain form POST in a new tab: the route handler sets a 1-hour client
// session and opens the customer's account page with a banner on every page.

export function ViewAsCustomer({ clientProfileId }: { clientProfileId: string }) {
  return (
    <details className="group relative">
      <summary className="lunia-btn lunia-btn-ghost min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">View as customer</summary>
      <div className="absolute end-0 z-30 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm shadow-lg">
        <p className="text-[var(--color-ink)]/75">
          Opens the site in a new tab, signed in as this customer for up to 1 hour. Anything you do there is real: bookings, cancellations and messages reach the customer. Every use is recorded in the audit log.
        </p>
        <form method="post" action={`/admin/clients/${clientProfileId}/view-as`} target="_blank">
          <button type="submit" className="lunia-btn lunia-btn-forest min-h-11 w-full">
            Open customer view
          </button>
        </form>
        <p className="border-t border-[var(--line)] pt-3 text-xs text-[var(--color-ink)]/55">
          To see what a brand-new visitor sees, open{" "}
          <a href="/ar" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            the website
          </a>{" "}
          in a private (incognito) window, so none of your sign-ins carry over.
        </p>
      </div>
    </details>
  );
}
