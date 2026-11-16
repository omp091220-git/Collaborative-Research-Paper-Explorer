import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-xl',
  footer,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Premium Backdrop with Glass Blur */}
      <div
        className="fixed inset-0 bg-[#0A0B12]/80 backdrop-blur-md transition-opacity animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Surface */}
      <div
        className={`relative w-full ${maxWidth} bg-[#1B1D2B] rounded-2xl shadow-2xl shadow-black/60 border border-white/12 z-10 overflow-hidden transform transition-all animate-scaleUp text-[#F8FAFC]`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between p-5 sm:p-6 border-b border-white/[0.08]">
            <div className="pr-4">
              {title && (
                <h3 className="text-lg font-bold text-[#F8FAFC] tracking-tight leading-6">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-xs sm:text-sm text-[#A1A1B5] mt-1 font-normal leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-[#71758B] hover:text-[#F8FAFC] p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5 sm:p-6 max-h-[76vh] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 sm:px-6 bg-[#161827] border-t border-white/[0.08] flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
