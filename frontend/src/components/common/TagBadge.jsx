import { X } from 'lucide-react';

export default function TagBadge({
  tag,
  onRemove,
  onClick,
  active = false,
  className = '',
}) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 border select-none ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
          : onClick
          ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 cursor-pointer shadow-2xs'
          : 'bg-slate-50 text-slate-700 border-slate-200'
      } ${className}`}
    >
      <span>{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          className="text-slate-400 hover:text-rose-600 p-0.5 rounded-sm transition cursor-pointer"
          aria-label={`Remove ${tag}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
