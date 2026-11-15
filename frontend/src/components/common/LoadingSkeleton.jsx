export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 rounded ${className}`} />;
}

export function PaperCardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-4 w-1/2" />
      <div className="space-y-1.5 pt-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-20 rounded-lg" />
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
          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 flex items-center justify-between gap-4"
        >
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function LoadingSkeleton({ count = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export const PaperListSkeleton = LoadingSkeletonList;

export default LoadingSkeleton;
