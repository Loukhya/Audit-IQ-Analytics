import { useState, useCallback, useEffect } from 'react';

const TOAST_TYPES = {
  success: { bg: '#065f46', border: '#10b981', icon: '✓' },
  error: { bg: '#7f1d1d', border: '#ef4444', icon: '✕' },
  warning: { bg: '#78350f', border: '#f59e0b', icon: '⚠' },
  info: { bg: '#1e3a5f', border: '#3b82f6', icon: 'ℹ' },
};

let toastId = 0;
let globalAddToast = null;

export function useToast() {
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    if (globalAddToast) globalAddToast(message, type, duration);
  }, []);
  return {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    warning: (msg) => addToast(msg, 'warning'),
    info: (msg) => addToast(msg, 'info'),
    toast: addToast,
  };
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    globalAddToast = (message, type, duration) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, message, type, duration }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    };
    return () => { globalAddToast = null; };
  }, []);

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {toasts.map((t) => {
        const style = TOAST_TYPES[t.type] || TOAST_TYPES.info;
        return (
          <div key={t.id} style={{
            background: style.bg, borderLeft: `4px solid ${style.border}`,
            color: '#fff', padding: '12px 18px', borderRadius: 8,
            minWidth: 280, maxWidth: 400, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 10,
            animation: 'slideInRight 0.3s ease-out',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{style.icon}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, opacity: 0.7 }}
            >✕</button>
          </div>
        );
      })}
    </div>
  );
}
