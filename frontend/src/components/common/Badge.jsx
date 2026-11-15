const variants = {
  default: 'bg-slate-100 text-slate-800 border-slate-300',
  primary: 'bg-indigo-50 text-indigo-800 border-indigo-300 font-semibold',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
  warning: 'bg-amber-50 text-amber-900 border-amber-300 font-semibold',
  danger: 'bg-rose-50 text-rose-800 border-rose-300 font-semibold',
  purple: 'bg-purple-50 text-purple-900 border-purple-300 font-semibold',
  blue: 'bg-sky-50 text-sky-900 border-sky-300 font-semibold',
  indigo: 'bg-indigo-50 text-indigo-800 border-indigo-300 font-semibold',
};

const sizes = {
  xs: 'text-[10px] px-1.5 py-0.5 rounded',
  sm: 'text-xs px-2 py-0.5 rounded-md',
  md: 'text-xs px-2.5 py-1 rounded-md font-medium',
};

export default function Badge({
  children,
  variant = 'default',
  size = 'sm',
  dot = false,
  className = '',
}) {
  const dotColors = {
    default: 'bg-slate-400',
    primary: 'bg-indigo-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    purple: 'bg-purple-500',
    blue: 'bg-sky-500',
    indigo: 'bg-indigo-600',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 border font-medium whitespace-nowrap ${variants[variant] || variants.default} ${sizes[size] || sizes.sm} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant] || 'bg-slate-400'}`} />}
      {children}
    </span>
  );
}
