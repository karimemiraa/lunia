import { ShellSkeleton, SkeletonStatRow, SkeletonCard } from "./_components/Skeleton";

// Dashboard (and fallback for admin routes without their own loading.tsx).
export default function AdminLoading() {
  return (
    <ShellSkeleton>
      <div className="lunia-card p-6">
        <div className="lunia-skeleton h-3 w-24" />
        <div className="lunia-skeleton mt-3 h-10 w-40" />
      </div>
      <SkeletonStatRow />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><SkeletonCard rows={6} /></div>
        <SkeletonCard rows={4} />
      </div>
    </ShellSkeleton>
  );
}
