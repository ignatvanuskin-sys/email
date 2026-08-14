"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Kind = "success" | "error" | "info";
type Toast = { id: number; kind: Kind; message: string };

type ToastCtx = { notify: (message: string, kind?: Kind) => void };

const Ctx = createContext<ToastCtx>({ notify: () => {} });

export function useToast(): ToastCtx {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const notify = useCallback((message: string, kind: Kind = "info") => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      <div className="toast-viewport" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span aria-hidden>{t.kind === "success" ? "✓" : t.kind === "error" ? "✕" : "ℹ"}</span>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
