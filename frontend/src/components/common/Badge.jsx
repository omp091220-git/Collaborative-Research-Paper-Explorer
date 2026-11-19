const variants = {
  default:
    'bg-theme-elevated text-theme-secondary border-white/10',
  primary:
    'bg-violet-500/15 text-violet-300 border-violet-500/30 font-semibold',
  success:
    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-semibold',
  warning:
    'bg-amber-500/15 text-amber-300 border-amber-500/30 font-semibold',
  danger:
    'bg-rose-500/15 text-rose-300 border-rose-500/30 font-semibold',
  purple:
    'bg-purple-500/15 text-purple-300 border-purple-500/30 font-semibold',
  blue:
    'bg-sky-500/15 text-sky-300 border-sky-500/30 font-semibold',
  cyan:
    'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 font-semibold',
  indigo:
    'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 font-semibold',
};

const sizes = {
  xs: 'text-[10px] px-2 py-0.5 rounded-md tracking-wide',
  sm: 'text-xs px-2.5 py-0.5 rounded-lg font-medium',
  md: 'text-xs px-3 py-1 rounded-xl font-medium',
};

const dotColors = {
  default: 'bg-[#71758B]',
  primary: 'bg-violet-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-rose-400',
  purple: 'bg-purple-400',
  blue: 'bg-sky-400',
  cyan: 'bg-cyan-400',
  indigo: 'bg-indigo-400',
};

export default function Badge({
  children,
  variant = 'default',
  size = 'sm',
  dot = false,
  className = '',
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border backdrop-blur-xs select-none transition-colors ${
        variants[variant] || variants.default
      } ${sizes[size] || sizes.sm} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            dotColors[variant] || 'bg-[#71758B]'
          }`}
        />
      )}
      <span>{children}</span>
    </span>
  );
}
