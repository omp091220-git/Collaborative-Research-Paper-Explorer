import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';

export default function ErrorState({
  title = 'Failed to load data',
  message = 'An unexpected server error occurred while retrieving this information.',
  onRetry,
  className = '',
}) {
  return (
    <div
      className={`p-6 rounded-2xl border border-rose-500/20 bg-theme-card shadow-sm text-theme-main ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/25 shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-rose-300 tracking-tight">{title}</h4>
          <p className="text-xs text-theme-secondary font-normal mt-1 leading-relaxed">
            {message}
          </p>
          {onRetry && (
            <div className="mt-3.5">
              <Button
                variant="dangerOutline"
                size="xs"
                onClick={onRetry}
                iconLeft={RefreshCw}
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
