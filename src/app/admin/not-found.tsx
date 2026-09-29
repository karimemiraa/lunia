import Link from "next/link";
import { EmptyState } from "./_components/EmptyState";

// Rendered when a record page calls notFound() (customer, invoice, session…).
export default function AdminNotFound() {
  return (
    <div className="lunia-admin-bg flex min-h-screen items-center justify-center p-6">
      <div className="lunia-card w-full max-w-md">
        <div className="flex justify-center pt-8">
          <span className="lunia-logo-stage !px-4 !py-2"><span role="img" aria-label="LUNIA" className="lunia-logo h-5" /></span>
        </div>
        <EmptyState
          title="We couldn't find that"
          body="The record may have been removed, or the link is out of date. Try a search, or head back to today's dashboard."
          icon={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8.5 11h5" /></>}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/admin" className="lunia-btn lunia-btn-forest lunia-btn-sm">Go to dashboard</Link>
              <Link href="/admin/search" className="lunia-btn lunia-btn-ghost lunia-btn-sm">Search</Link>
            </div>
          }
        />
      </div>
    </div>
  );
}
