import Modal from './Modal';
import Button from './Button';
import { AlertTriangle, Info } from 'lucide-react';

export default function ConfirmationDialog({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText,
  confirmLabel,
  cancelText = 'Cancel',
  danger,
  variant,
  loading = false,
}) {
  const handleClose = onClose || onCancel;
  const isDanger = danger !== undefined ? danger : variant === 'danger';
  const resolvedConfirmText = confirmLabel || confirmText || 'Confirm';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-md"
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={isDanger ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {resolvedConfirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div
          className={`p-3 rounded-2xl shrink-0 ${
            isDanger
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
              : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
          }`}
        >
          {isDanger ? (
            <AlertTriangle className="w-5 h-5" />
          ) : (
            <Info className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1">
          <h4 className="text-base font-bold text-[#F8FAFC] tracking-tight">
            {title}
          </h4>
          <p className="text-xs sm:text-sm text-[#A1A1B5] mt-1.5 leading-relaxed font-normal">
            {message}
          </p>
        </div>
      </div>
    </Modal>
  );
}
