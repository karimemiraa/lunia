import { ShellSkeleton } from "../_components/Skeleton";

export default function CalendarLoading() {
  return (
    <ShellSkeleton>
      <div className="flex gap-3">
        <div className="lunia-skeleton h-10 w-48" />
        <div className="lunia-skeleton ms-auto h-10 w-32" />
      </div>
      <div className="lunia-card p-4">
        <div className="mb-3 grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => <div key={i} className="lunia-skeleton h-3" />)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }, (_, i) => <div key={i} className="lunia-skeleton h-20" style={{ opacity: 0.9 - (i % 7) * 0.05 }} />)}
        </div>
      </div>
    </ShellSkeleton>
  );
}
