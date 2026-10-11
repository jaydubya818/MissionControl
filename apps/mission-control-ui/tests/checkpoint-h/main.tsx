import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthRuntimeProvider } from "../../src/auth/AuthRuntimeContext";
import { SofieOwnerReview } from "../../src/eos/views/SofieOwnerReview";
import "./style.css";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") || "dark";
createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen bg-app p-4 text-ink">
    <h1 className="mb-4 text-xl">
      UI component fixture — no authenticated owner authority
    </h1>
    <AuthRuntimeProvider
      value={{
        mode: params.get("scenario") === "signed-out" ? "legacy" : "clerk",
      }}
    >
      <BrowserRouter>
        <SofieOwnerReview projectId={"project-ui-fixture" as any} />
      </BrowserRouter>
    </AuthRuntimeProvider>
  </main>,
);
