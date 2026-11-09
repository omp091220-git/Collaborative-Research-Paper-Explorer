
import { forwardRef, createElement, isValidElement } from 'react';
import { Loader2 } from 'lucide-react';

const variants = {
  primary:
    'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs focus-visible:ring-indigo-500 border border-transparent font-semibold',

  secondary:
    'bg-slate-900 hover:bg-slate-800 active:bg-black text-white shadow-xs focus-visible:ring-slate-900 border border-transparent font-semibold',

  outline:
    'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 hover:text-slate-900 border border-slate-300 shadow-2xs hover:border-slate-400 focus-visible:ring-indigo-500 font-semibold',

  ghost:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-800 hover:text-slate-950 focus-visible:ring-indigo-500 font-semibold border border-transparent',

  subtle:
    'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 focus-visible:ring-indigo-500 font-semibold',

  danger:
    'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs focus-visible:ring-rose-500 border border-transparent font-semibold',

  dangerOutline:
    'bg-white hover:bg-rose-50 active:bg-rose-100 text-rose-700 border border-rose-300 hover:border-rose-400 focus-visible:ring-rose-500 font-semibold',
};

const sizes = {
  xs: 'text-xs px-2.5 py-1 rounded-md gap-1.5',
  sm: 'text-xs font-medium px-3 py-1.5 rounded-lg gap-2',
  md: 'text-sm font-medium px-4 py-2 rounded-lg gap-2',
  lg: 'text-base font-medium px-5 py-2.5 rounded-xl gap-2.5',
};

// Safely render icon components or already-created React elements.
const renderIcon = (Icon) => {
  if (!Icon) return null;

  // Already a valid React element
  if (isValidElement(Icon)) {
    return Icon;
  }

  // Lucide icons and React components (including forwardRef components)
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

  const variantClass =
    variants[variant] || variants.primary;

  const sizeClass =
    sizes[size] || sizes.md;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center
        font-sans tracking-tight transition-all duration-150
        select-none focus:outline-none focus-visible:ring-2
        focus-visible:ring-offset-1
        disabled:opacity-50 disabled:pointer-events-none
        disabled:cursor-not-allowed cursor-pointer
        ${variantClass}
        ${sizeClass}
        ${className}
      `}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <Loader2
          className="w-4 h-4 animate-spin shrink-0"
          aria-hidden="true"
        />
      ) : IconLeft ? (
        <span className="shrink-0">
          {renderIcon(IconLeft)}
        </span>
      ) : null}

      <span>{children}</span>

      {!loading && IconRight ? (
        <span className="shrink-0">
          {renderIcon(IconRight)}
        </span>
      ) : null}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
