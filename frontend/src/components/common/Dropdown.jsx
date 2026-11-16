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
          className={`absolute ${
            alignClasses[align] || alignClasses.right
          } mt-2 w-56 rounded-2xl bg-[#23263A] shadow-2xl shadow-black/60 border border-white/10 py-1.5 z-50 animate-scaleUp text-[#F8FAFC]`}
          role="menu"
        >
          {items.map((item, idx) => {
            if (item.divider) {
              return (
                <div
                  key={idx}
                  className="my-1 border-t border-white/[0.08]"
                />
              );
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
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition text-left cursor-pointer ${
                  item.danger
                    ? 'text-rose-400 hover:bg-rose-500/10 hover:text-rose-300'
                    : 'text-[#F8FAFC] hover:bg-white/8 hover:text-white'
                } ${item.disabled ? 'opacity-40 pointer-events-none' : ''}`}
                role="menuitem"
              >
                {Icon && (
                  <Icon className="w-4 h-4 shrink-0 text-[#A1A1B5]" />
                )}
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#1B1D2B] text-[#A1A1B5] font-semibold border border-white/10">
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
