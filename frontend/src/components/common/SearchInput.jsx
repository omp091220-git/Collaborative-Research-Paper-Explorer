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
      <Search className="absolute left-3 w-4 h-4 text-slate-500 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 font-medium placeholder:text-slate-500 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-2xs"
      />
      {value ? (
        <button
          type="button"
          onClick={() => (onClear ? onClear() : onChange(''))}
          className="absolute right-2.5 text-slate-500 hover:text-slate-900 p-0.5 rounded cursor-pointer"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      ) : shortcutKey ? (
        <span className="absolute right-2.5 text-[10px] font-mono font-semibold text-slate-600 border border-slate-300 px-1.5 py-0.5 rounded bg-slate-100">
          {shortcutKey}
        </span>
      ) : null}
    </div>
  );
}
