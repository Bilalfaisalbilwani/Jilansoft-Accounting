import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

type ToastCallback = (toast: ToastMessage) => void;
const listeners = new Set<ToastCallback>();

export const toast = {
  success(title: string, description?: string) {
    publish('success', title, description);
  },
  error(title: string, description?: string) {
    publish('error', title, description);
  },
  info(title: string, description?: string) {
    publish('info', title, description);
  }
};

function publish(type: 'success' | 'error' | 'info', title: string, description?: string) {
  const toastMessage: ToastMessage = {
    id: Math.random().toString(36).substring(2, 9),
    type,
    title,
    description
  };
  listeners.forEach(cb => cb(toastMessage));
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleAdd = (newToast: ToastMessage) => {
      setToasts(prev => [...prev, newToast]);
      // Auto dismiss after 4 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, 4000);
    };
    listeners.add(handleAdd);
    return () => {
      listeners.delete(handleAdd);
    };
  }, []);

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: -20, transition: { duration: 0.15 } }}
              className="pointer-events-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xl flex items-start gap-3 border-l-4"
              style={{
                borderLeftColor:
                  t.type === 'success' ? '#10b981' : t.type === 'error' ? '#f43f5e' : '#3b82f6',
              }}
            >
              <div className="mt-0.5 shrink-0">
                {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {t.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-500" />}
                {t.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.title}</h4>
                {t.description && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-0.5 rounded-md shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
