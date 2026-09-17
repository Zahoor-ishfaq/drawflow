import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#101623]/45" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-[380px] rounded-2xl border border-line bg-panel p-5 shadow-[0_20px_60px_rgba(15,25,45,0.3)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className={'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' + (danger ? 'bg-red-50 text-red-500' : 'bg-accent-weak text-accent')}>
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-[15px] font-semibold text-t1">{title}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-t2">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button
            variant="primary"
            className={danger ? '!bg-red-500 !shadow-[0_2px_8px_rgba(239,68,68,0.35)]' : ''}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
