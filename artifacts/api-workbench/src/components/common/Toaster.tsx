import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createId } from '@/lib/id';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: string; title: string; description?: string; kind: ToastKind };

type ToastApi = {
  toast: (toast: { title: string; description?: string; kind?: ToastKind }) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
const TOAST_MS = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback<ToastApi['toast']>(({ title, description, kind = 'info' }) => {
    const entry: Toast = { id: createId('toast'), title, description, kind };
    setToasts((current) => [...current.slice(-3), entry]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== entry.id)), TOAST_MS);
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`} role="status" data-testid="status-toast">
            <strong>{item.title}</strong>
            {item.description ? <span>{item.description}</span> : null}
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
