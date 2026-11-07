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
    <div className={`flex flex-col items-center justify-center text-center p-8 md:p-12 bg-white rounded-xl border border-dashed border-slate-200 ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mt-1 mb-6 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction} iconLeft={actionIcon}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
