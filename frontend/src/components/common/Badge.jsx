const variants = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  primary: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  blue: 'bg-sky-50 text-sky-700 border-sky-200',
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
