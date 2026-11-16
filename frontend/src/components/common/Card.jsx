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
      className={`bg-[#1B1D2B] rounded-2xl border border-white/[0.08] text-[#F8FAFC] shadow-sm transition-all duration-200 ${
        hoverable
          ? 'hover:border-violet-500/40 hover:bg-[#1E2132] hover:shadow-lg hover:shadow-violet-950/20 hover:-translate-y-0.5 cursor-pointer'
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
      className={`p-5 sm:p-6 border-b border-white/[0.07] ${className}`}
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
      className={`p-4 sm:px-6 bg-[#161827]/80 border-t border-white/[0.07] rounded-b-2xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
