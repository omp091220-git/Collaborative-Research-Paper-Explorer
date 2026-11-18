export default function Card({
  children,
  className = '',
  hoverable = false,
  glow = false,
  onClick,
  ...props
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-theme-card rounded-2xl border border-theme-subtle text-theme-main shadow-sm transition-all duration-200 ${
        hoverable
          ? 'hover:border-violet-500/40 hover:bg-theme-elevated hover:shadow-lg hover:shadow-violet-950/20 hover:-translate-y-0.5 cursor-pointer'
          : ''
      } ${glow ? 'shadow-md shadow-violet-950/30 border-violet-500/30' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }) {
  return (
    <div
      className={`p-5 sm:p-6 border-b border-theme-subtle ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className = '', ...props }) {
  return (
    <div className={`p-5 sm:p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', ...props }) {
  return (
    <div
      className={`p-4 sm:px-6 bg-theme-secondary/80 border-t border-theme-subtle rounded-b-2xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
