import { Search, X } from 'lucide-react';

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  onClear,
  className = '',
  shortcutKey,
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="absolute left-3.5 w-4 h-4 text-theme-muted pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2.5 text-sm bg-theme-secondary border border-white/10 rounded-xl text-theme-main font-medium placeholder:text-theme-muted hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all shadow-xs"
      />
      {value ? (
        <button
          type="button"
          onClick={() => (onClear ? onClear() : onChange(''))}
          className="absolute right-3 text-theme-muted hover:text-theme-main p-1 rounded-lg hover:bg-white/10 cursor-pointer transition"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : shortcutKey ? (
        <span className="absolute right-3 text-[10px] font-mono font-semibold text-theme-muted border border-white/10 px-1.5 py-0.5 rounded-md bg-theme-elevated">
          {shortcutKey}
        </span>
      ) : null}
    </div>
  );
}
