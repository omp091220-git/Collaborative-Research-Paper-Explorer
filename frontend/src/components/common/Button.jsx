import { forwardRef, createElement, isValidElement } from 'react';
import { Loader2 } from 'lucide-react';

const variants = {
  primary:
    'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:via-purple-500 hover:to-indigo-500 text-white shadow-md shadow-violet-600/25 active:scale-[0.98] border border-violet-400/30 font-semibold focus-visible:ring-violet-500',

  secondary:
    'bg-[#23263A] hover:bg-[#2B2F46] active:bg-[#1C1E2F] text-[#F8FAFC] border border-white/10 shadow-sm active:scale-[0.98] font-semibold focus-visible:ring-slate-400',

  outline:
    'bg-transparent hover:bg-white/5 active:bg-white/10 text-[#F8FAFC] border border-white/12 hover:border-white/25 active:scale-[0.98] font-semibold focus-visible:ring-violet-500',

  ghost:
    'bg-transparent hover:bg-white/5 active:bg-white/10 text-[#A1A1B5] hover:text-[#F8FAFC] active:scale-[0.98] font-semibold focus-visible:ring-violet-500 border border-transparent',

  subtle:
    'bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 hover:text-white border border-violet-500/25 active:scale-[0.98] font-semibold focus-visible:ring-violet-500',

  cyan:
    'bg-gradient-to-r from-cyan-400 to-sky-500 hover:from-cyan-300 hover:to-sky-400 text-slate-950 font-bold shadow-md shadow-cyan-500/20 active:scale-[0.98] border border-cyan-300/30 focus-visible:ring-cyan-400',

  danger:
    'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-sm shadow-rose-600/25 active:scale-[0.98] border border-rose-500/30 font-semibold focus-visible:ring-rose-500',

  dangerOutline:
    'bg-transparent hover:bg-rose-500/10 active:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 hover:border-rose-500/60 active:scale-[0.98] font-semibold focus-visible:ring-rose-500',
};

const sizes = {
  xs: 'text-xs px-2.5 py-1 rounded-lg gap-1.5',
  sm: 'text-xs font-medium px-3 py-1.5 rounded-xl gap-2',
  md: 'text-sm font-medium px-4 py-2 rounded-xl gap-2',
  lg: 'text-base font-medium px-5 py-2.5 rounded-2xl gap-2.5',
};

const renderIcon = (Icon) => {
  if (!Icon) return null;
  if (isValidElement(Icon)) return Icon;
  if (typeof Icon === 'function' || typeof Icon === 'object') {
    return createElement(Icon, {
      className: 'w-4 h-4 shrink-0',
      'aria-hidden': true,
    });
  }
  return null;
};

const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    iconLeft: IconLeft,
    iconRight: IconRight,
    className = '',
    type = 'button',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;
  const variantClass = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || sizes.md;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center
        font-sans tracking-tight transition-all duration-150
        select-none focus:outline-none focus-visible:ring-2
        focus-visible:ring-offset-2 focus-visible:ring-offset-[#10111B]
        disabled:opacity-40 disabled:pointer-events-none
        disabled:cursor-not-allowed cursor-pointer
        ${variantClass}
        ${sizeClass}
        ${className}
      `}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0 text-current" aria-hidden="true" />
      ) : IconLeft ? (
        <span className="shrink-0">{renderIcon(IconLeft)}</span>
      ) : null}

      <span>{children}</span>

      {!loading && IconRight ? (
        <span className="shrink-0">{renderIcon(IconRight)}</span>
      ) : null}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
