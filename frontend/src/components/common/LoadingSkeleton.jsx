export function Skeleton({ className = '' }) {
  return (
    <div
      className={`bg-white/[0.06] rounded-xl animate-shimmer ${className}`}
    />
  );
}

export function PaperCardSkeleton() {
  return (
    <div className="bg-[#1B1D2B] p-5 sm:p-6 rounded-2xl border border-white/[0.08] shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-3/4 rounded-lg" />
        <Skeleton className="h-5 w-16 rounded-md" />
      </div>
      <Skeleton className="h-4 w-1/2 rounded-md" />
      <div className="space-y-2 pt-1">
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-5/6 rounded" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-white/[0.07]">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-8 w-20 rounded-xl" />
      </div>
    </div>
  );
}

export function LoadingSkeletonGrid({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <PaperCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function LoadingSkeletonList({ count = 6 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-4 sm:p-5 bg-[#1B1D2B] rounded-2xl border border-white/[0.08] flex items-center justify-between gap-4"
        >
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 rounded-md" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </div>
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function LoadingSkeleton({ count = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-xl" />
      ))}
    </div>
  );
}

export const PaperListSkeleton = LoadingSkeletonList;

export default LoadingSkeleton;
