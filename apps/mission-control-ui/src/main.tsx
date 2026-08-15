import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/react";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { SetupMessage } from "./SetupMessage";
import { ToastProvider } from "./Toast";
import { RuntimeCompatibilityGate } from "./RuntimeCompatibilityGate";
import App from "./App";
import { resolveAuthMode } from "./auth/authMode";
import { AuthRuntimeProvider } from "./auth/AuthRuntimeContext";
import { AuthConfigurationError, ClerkSessionBoundary } from "./auth/AuthStates";
import "./index.css";

const convexUrl = (import.meta.env.VITE_CONVEX_URL as string)?.trim() || "";
const clerkPublishableKey = (
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
)?.trim();
const auth = resolveAuthMode({
  configuredMode: import.meta.env.VITE_AUTH_MODE as string | undefined,
  clerkPublishableKey,
});

try {
  const initialTheme = window.localStorage.getItem("mc.theme") === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", initialTheme);
  document.documentElement.classList.toggle("light", initialTheme === "light");
} catch {
  document.documentElement.setAttribute("data-theme", "dark");
}

const rootEl = document.getElementById("root");

function ProductApplication() {
  return (
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
  );
}

if (!rootEl) {
  document.body.innerHTML = "<div style='padding:24px;font-family:system-ui'>Mission Control: no #root element.</div>";
} else {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        {!convexUrl ? (
          <SetupMessage />
        ) : auth.mode === "invalid" ? (
          <AuthConfigurationError message={auth.error ?? "Authentication is not configured."} />
        ) : auth.mode === "clerk" ? (
          <ClerkProvider publishableKey={clerkPublishableKey!} afterSignOutUrl="/">
            <ConvexProviderWithClerk
              client={new ConvexReactClient(convexUrl, { verbose: true })}
              useAuth={useAuth}
            >
              <ClerkSessionBoundary>
                <ProductApplication />
              </ClerkSessionBoundary>
            </ConvexProviderWithClerk>
          </ClerkProvider>
        ) : (
          <ConvexProvider client={new ConvexReactClient(convexUrl)}>
            <AuthRuntimeProvider value={{ mode: auth.mode }}>
              <ProductApplication />
            </AuthRuntimeProvider>
          </ConvexProvider>
        )}
      </ErrorBoundary>
    </React.StrictMode>
  );
}
