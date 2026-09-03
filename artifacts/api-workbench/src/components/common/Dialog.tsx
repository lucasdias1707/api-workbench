import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

type DialogProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  align?: 'center' | 'top';
  testId?: string;
};

export function Dialog({ title, description, onClose, children, footer, wide, align = 'center', testId }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus once, on open. Callers pass an inline onClose, so keying this on the
  // callback re-ran it on every keystroke and stole focus back to the close
  // button mid-typing.
  useEffect(() => {
    const target =
      ref.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      ref.current?.querySelector<HTMLElement>('.dialog-body input, .dialog-body textarea, .dialog-body select');
    target?.focus();
  }, []);

  return (
    <div
      className={`overlay ${align}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        data-testid={testId}
      >
        <div className="dialog-head">
          <div style={{ minWidth: 0 }}>
            <div className="dialog-title">{title}</div>
            {description ? <div className="dialog-sub">{description}</div> : null}
          </div>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog">
            <X size={15} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
