import { Dialog } from '@/components/common/Dialog';

type ConfirmDialogProps = {
  title: string;
  /** What is about to happen, in enough detail to decide. */
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A last check before something disappears.
 *
 * The confirm button is focused rather than the cancel one: someone who opened
 * this menu and chose Delete has already decided, and Enter should agree with
 * them. Escape and Cancel both back out, and the delete can still be undone
 * from the toast afterwards — this guards against the misclick, not the
 * decision.
 */
export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      testId="dialog-confirm"
      footer={
        <>
          <button className="btn" onClick={onCancel} data-testid="button-cancel-confirm">
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            data-autofocus
            data-testid="button-accept-confirm"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="hint" style={{ fontSize: 12.5, lineHeight: 1.6 }} data-testid="text-confirm-message">
        {message}
      </p>
    </Dialog>
  );
}
