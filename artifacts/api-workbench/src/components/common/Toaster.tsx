import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createId } from '@/lib/id';

type ToastKind = 'success' | 'error' | 'info';

/** One button on a toast. Undo is the reason this exists. */
type ToastAction = { label: string; run: () => void };

type Toast = {
  id: string;
  title: string;
  description?: string;
  kind: ToastKind;
  action?: ToastAction;
};

type ToastApi = {
  toast: (toast: {
    title: string;
    description?: string;
    kind?: ToastKind;
    action?: ToastAction;
    durationMs?: number;
  }) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
const TOAST_MS = 4200;
/** An undo has to be read, understood and aimed at, which 4 seconds does not cover. */
const ACTION_TOAST_MS = 9000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>(
    ({ title, description, kind = 'info', action, durationMs }) => {
      const entry: Toast = { id: createId('toast'), title, description, kind, action };
      setToasts((current) => [...current.slice(-3), entry]);
      window.setTimeout(
        () => setToasts((current) => current.filter((item) => item.id !== entry.id)),
        durationMs ?? (action ? ACTION_TOAST_MS : TOAST_MS),
      );
    },
    [],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`} role="status" data-testid="status-toast">
            <div className="toast-text">
              <strong>{item.title}</strong>
              {item.description ? <span>{item.description}</span> : null}
            </div>
            {item.action ? (
              <button
                className="toast-action"
                onClick={() => {
                  item.action?.run();
                  dismiss(item.id);
                }}
                data-testid="button-toast-action"
              >
                {item.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
