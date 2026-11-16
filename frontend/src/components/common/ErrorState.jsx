import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';

export default function ErrorState({
  title = 'Failed to load data',
  message = 'An unexpected server error occurred while retrieving this information.',
  onRetry,
  className = '',
}) {
  return (
    <div className={`p-6 rounded-2xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-slate-900 dark:text-slate-100 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">{title}</h4>
          <p className="text-xs text-rose-800 dark:text-rose-300 font-medium mt-1 leading-relaxed">{message}</p>
          {onRetry && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="xs"
                onClick={onRetry}
                iconLeft={RefreshCw}
                className="bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 font-semibold"
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
