import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { SetupMessage } from "./SetupMessage";
import { ToastProvider } from "./Toast";
import App from "./App";
import "./index.css";

const convexUrl = (import.meta.env.VITE_CONVEX_URL as string)?.trim() || "";

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
            <ToastProvider>
              <App />
            </ToastProvider>
          </ConvexProvider>
        )}
      </ErrorBoundary>
    </React.StrictMode>
  );
}
