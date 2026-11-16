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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all duration-150 border select-none ${
        active
          ? 'bg-violet-600 text-white border-violet-500 shadow-sm shadow-violet-600/30 font-semibold'
          : onClick
          ? 'bg-[#23263A] hover:bg-[#2B2F46] text-[#F8FAFC] border-white/10 hover:border-violet-500/30 cursor-pointer shadow-xs active:scale-[0.98]'
          : 'bg-[#1E2132] text-[#A1A1B5] border-white/[0.08]'
      } ${className}`}
    >
      <span className="truncate max-w-[200px]">{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          className="text-[#71758B] hover:text-rose-400 p-0.5 rounded-md hover:bg-rose-500/10 transition cursor-pointer"
          aria-label={`Remove ${tag}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
