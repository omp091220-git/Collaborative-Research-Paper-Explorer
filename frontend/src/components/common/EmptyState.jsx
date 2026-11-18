import { FileQuestion } from 'lucide-react';
import Button from './Button';

export default function EmptyState({
  icon: Icon = FileQuestion,
  title = 'No items found',
  description = 'Try adjusting your filters or search terms, or create a new entry.',
  actionLabel,
  onAction,
  actionIcon,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-theme-card/80 rounded-3xl border border-dashed border-theme-strong text-theme-main ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center mb-4 shadow-sm shadow-violet-950/20">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-base sm:text-lg font-bold text-theme-main tracking-tight">
        {title}
      </h3>
      <p className="text-xs sm:text-sm text-theme-secondary max-w-sm mt-1.5 mb-6 leading-relaxed font-normal">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button
          variant="primary"
          size="sm"
          onClick={onAction}
          iconLeft={actionIcon}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
