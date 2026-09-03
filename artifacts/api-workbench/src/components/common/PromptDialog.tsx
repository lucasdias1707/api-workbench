import { useState } from 'react';
import { Dialog } from '@/components/common/Dialog';

type PromptDialogProps = {
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

/** One-field dialog used for creating and renaming folders and requests. */
export function PromptDialog({
  title,
  description,
  label,
  initialValue = '',
  confirmLabel = 'Save',
  onCancel,
  onConfirm,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <Dialog
      title={title}
      description={description}
      onClose={onCancel}
      testId="dialog-prompt"
      footer={
        <>
          <button className="btn" onClick={onCancel} data-testid="button-prompt-cancel">
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!value.trim()} data-testid="button-prompt-confirm">
            {confirmLabel}
          </button>
        </>
      }
    >
      <label className="section-label" htmlFor="prompt-value">
        {label}
      </label>
      <input
        id="prompt-value"
        className="field"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
        data-testid="input-prompt-value"
        autoFocus
      />
    </Dialog>
  );
}
