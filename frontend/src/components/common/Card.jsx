export default function Card({
  children,
  className = '',
  hoverable = false,
  onClick,
  ...props
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-800 shadow-2xs transition-all duration-200 ${
        hoverable ? 'hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 cursor-pointer' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }) {
  return (
    <div className={`p-5 md:p-6 border-b border-slate-200 dark:border-slate-800 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = '', ...props }) {
  return (
    <div className={`p-5 md:p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', ...props }) {
  return (
    <div className={`p-4 md:px-6 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 rounded-b-xl ${className}`} {...props}>
      {children}
    </div>
  );
}
