import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((typeOrPayload, title, message, duration = 4500) => {
    let type = typeOrPayload;
    let resolvedTitle = title;
    let resolvedMessage = message;
    let resolvedDuration = duration;

    if (typeOrPayload && typeof typeOrPayload === 'object') {
      type = typeOrPayload.type || 'info';
      resolvedTitle = typeOrPayload.title;
      resolvedMessage = typeOrPayload.message;
      if (typeof typeOrPayload.duration === 'number') {
        resolvedDuration = typeOrPayload.duration;
      }
    }

    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    setToasts((prev) => [...prev, { id, type, title: resolvedTitle, message: resolvedMessage }]);

    if (resolvedDuration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, resolvedDuration);
    }
  }, [removeToast]);

  const success = useCallback((title, message) => addToast('success', title, message), [addToast]);
  const error = useCallback((title, message) => addToast('error', title, message, 6000), [addToast]);
  const info = useCallback((title, message) => addToast('info', title, message), [addToast]);
  const warning = useCallback((title, message) => addToast('warning', title, message), [addToast]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-indigo-500 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
  };

  const borders = {
    success: 'border-emerald-500/30 bg-theme-card text-theme-main',
    error: 'border-rose-500/40 bg-theme-card text-theme-main',
    info: 'border-violet-500/35 bg-theme-card text-theme-main',
    warning: 'border-amber-500/40 bg-theme-card text-theme-main',
  };

  return (
    <ToastContext.Provider value={{ success, error, info, warning, addToast, removeToast }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-fadeIn ${borders[t.type] || borders.info}`}
            role="status"
          >
            {icons[t.type] || icons.info}
            <div className="flex-1 min-w-0">
              {t.title && <h4 className="text-sm font-semibold text-theme-main leading-snug">{t.title}</h4>}
              {t.message && <p className="text-xs text-theme-secondary mt-0.5 leading-relaxed">{t.message}</p>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-theme-muted hover:text-theme-main p-0.5 rounded transition cursor-pointer"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
