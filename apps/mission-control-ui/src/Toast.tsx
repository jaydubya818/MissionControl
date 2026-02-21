import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster, toast as sonnerToast } from "sonner";

const ToastContext = createContext<{
  toast: (text: string, error?: boolean) => void;
}>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      setTheme(isLight ? "light" : "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const toast = useCallback((text: string, error?: boolean) => {
    if (error) {
      sonnerToast.error(text, { duration: 4500 });
      return;
    }
    sonnerToast.message(text, { duration: 3200 });
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Toaster
        theme={theme}
        position="top-center"
        closeButton
        toastOptions={{
          classNames: {
            toast: "border border-border bg-card text-card-foreground shadow-lg",
            title: "text-sm font-medium",
            closeButton: "bg-secondary text-secondary-foreground border-border",
          },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
