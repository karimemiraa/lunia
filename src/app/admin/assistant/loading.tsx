import { ShellSkeleton, SkeletonTable } from "../_components/Skeleton";

export default function Loading() {
  return (
    <ShellSkeleton>
      <div className="flex flex-wrap gap-3">
        <div className="lunia-skeleton h-10 w-64" />
        <div className="lunia-skeleton h-10 w-36" />
      </div>
      <SkeletonTable />
    </ShellSkeleton>
  );
}
