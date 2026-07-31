import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { SetupMessage } from "./SetupMessage";
import { ToastProvider } from "./Toast";
import { RuntimeCompatibilityGate } from "./RuntimeCompatibilityGate";
import App from "./App";
import "./index.css";

const convexUrl = (import.meta.env.VITE_CONVEX_URL as string)?.trim() || "";

try {
  const initialTheme = window.localStorage.getItem("mc.theme") === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", initialTheme);
  document.documentElement.classList.toggle("light", initialTheme === "light");
} catch {
  document.documentElement.setAttribute("data-theme", "dark");
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<div style='padding:24px;font-family:system-ui'>Mission Control: no #root element.</div>";
} else {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        {!convexUrl ? (
          <SetupMessage />
        ) : (
          <ConvexProvider client={new ConvexReactClient(convexUrl)}>
            <RuntimeCompatibilityGate>
              <ToastProvider>
                <BrowserRouter
                  future={{
                    v7_startTransition: true,
                    v7_relativeSplatPath: true,
                  }}
                >
                  <App />
                </BrowserRouter>
              </ToastProvider>
            </RuntimeCompatibilityGate>
          </ConvexProvider>
        )}
      </ErrorBoundary>
    </React.StrictMode>
  );
}
