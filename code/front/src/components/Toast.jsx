import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const mostrar = useCallback((mensagem, tom = 'info') => {
    window.clearTimeout(timerRef.current);
    setToast({ mensagem, tom, id: Date.now() });
    timerRef.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  const value = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" role="status">
        {toast && <div key={toast.id} className={`toast toast-${toast.tom}`}>{toast.mensagem}</div>}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return ctx.mostrar;
}

export const AVISO_MAPA = 'O mapa do campus e as PUC Stops ficam no app Mapa da PUC (em desenvolvimento).';
