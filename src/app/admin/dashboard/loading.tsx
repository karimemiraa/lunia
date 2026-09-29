import { ShellSkeleton, SkeletonStatRow, SkeletonCard } from "../_components/Skeleton";

export default function BusinessLoading() {
  return (
    <ShellSkeleton>
      <SkeletonStatRow />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard rows={5} />
        <SkeletonCard rows={5} />
      </div>
    </ShellSkeleton>
  );
}
