import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';

export default function ErrorState({
  title = 'Failed to load data',
  message = 'An unexpected server error occurred while retrieving this information.',
  onRetry,
  className = '',
}) {
  return (
    <div className={`p-6 rounded-xl border border-rose-200 bg-rose-50/60 text-slate-800 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-rose-100 text-rose-600 shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-rose-900">{title}</h4>
          <p className="text-xs text-rose-700 mt-1 leading-relaxed">{message}</p>
          {onRetry && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="xs"
                onClick={onRetry}
                iconLeft={RefreshCw}
                className="bg-white hover:bg-rose-50 border-rose-300 text-rose-700"
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
