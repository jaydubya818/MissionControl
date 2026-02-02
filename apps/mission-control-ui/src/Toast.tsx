import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastMessage = { id: number; text: string; error?: boolean };

const ToastContext = createContext<{
  toast: (text: string, error?: boolean) => void;
}>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback((text: string, error?: boolean) => {
    const id = Date.now();
    setMessages((m) => [...m, { id, text, error }]);
    setTimeout(() => {
      setMessages((m) => m.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: msg.error ? "#7f1d1d" : "#1e293b",
              color: msg.error ? "#fecaca" : "#e2e8f0",
              border: `1px solid ${msg.error ? "#b91c1c" : "#334155"}`,
              fontSize: "0.875rem",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
