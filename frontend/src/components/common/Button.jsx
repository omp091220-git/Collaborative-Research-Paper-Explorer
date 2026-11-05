import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs focus-visible:ring-indigo-500 border border-transparent',
  secondary: 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs focus-visible:ring-slate-900 border border-transparent',
  outline: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs hover:border-slate-300 focus-visible:ring-slate-400',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 hover:text-slate-900 focus-visible:ring-slate-400 border border-transparent',
  subtle: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 focus-visible:ring-indigo-400 border border-transparent',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs focus-visible:ring-rose-500 border border-transparent',
  dangerOutline: 'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 focus-visible:ring-rose-400',
};

const sizes = {
  xs: 'text-xs px-2.5 py-1 rounded-md gap-1.5',
  sm: 'text-xs font-medium px-3 py-1.5 rounded-lg gap-2',
  md: 'text-sm font-medium px-4 py-2 rounded-lg gap-2',
  lg: 'text-base font-medium px-5 py-2.5 rounded-xl gap-2.5',
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

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center font-sans tracking-tight transition-all duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : IconLeft ? (
        <span className="shrink-0">{typeof IconLeft === 'function' ? <IconLeft className="w-4 h-4" /> : IconLeft}</span>
      ) : null}

      <span>{children}</span>

      {!loading && IconRight ? (
        <span className="shrink-0">{typeof IconRight === 'function' ? <IconRight className="w-4 h-4" /> : IconRight}</span>
      ) : null}
    </button>
  );
});

export default Button;
