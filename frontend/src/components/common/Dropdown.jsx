import { useState, useRef, useEffect } from 'react';

export default function Dropdown({
  trigger,
  items = [],
  align = 'right',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const alignClasses = {
    right: 'right-0',
    left: 'left-0',
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <div onClick={() => setIsOpen((prev) => !prev)} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <div
          className={`absolute ${alignClasses[align] || alignClasses.right} mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-300 dark:border-slate-700 py-1.5 z-40 animate-scaleUp`}
          role="menu"
        >
          {items.map((item, idx) => {
            if (item.divider) {
              return <div key={idx} className="my-1 border-t border-slate-200 dark:border-slate-800" />;
            }

            const Icon = item.icon;

            return (
              <button
                key={idx}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setIsOpen(false);
                  if (item.onClick) item.onClick();
                }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold transition text-left cursor-pointer ${
                  item.danger
                    ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                    : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white'
                } ${item.disabled ? 'opacity-40 pointer-events-none' : ''}`}
                role="menuitem"
              >
                {Icon && <Icon className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-slate-800 dark:text-slate-400" />}
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
